import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Text,
    FlatList,
    Pressable,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import { MessageBubble } from '@/components/MessageBubble';
import { ImageBubble } from '@/components/ImageBubble';
import { ChatInput } from '@/components/ChatInput';
import { EmojiPicker } from '@/components/EmojiPicker';
import {
    getGroupMessages,
    saveGroupMessage,
    generateMessageId,
    clearGroupUnreadCount,
    type GroupMessage,
} from '@/lib/storage';
import {
    encryptGroupMessage,
    getEncryptionKeypair,
    base64ToUint8,
    uint8ToBase58,
    decryptGroupMessage,
} from '@/lib/crypto';
import { getStoredKeypair } from '@/lib/keychain';
import { getGroupInfo, sendGroupMessage, getPublicKeyByUsername, getUsernameByOwner, fetchInbox, leaveGroup, type GroupInfo } from '@/lib/api';
import * as Haptics from 'expo-haptics';

export default function GroupChatScreen() {
    const { groupId } = useLocalSearchParams<{ groupId: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<GroupMessage[]>([]);
    const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [pendingEmoji, setPendingEmoji] = useState<string | null>(null);
    const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
    const listRef = useRef<FlatList<GroupMessage>>(null);
    const processedArweaveIds = useRef<Set<string>>(new Set());
    const isNearBottom = useRef(true);

    useEffect(() => {
        if (groupId) {
            clearGroupUnreadCount(groupId);
            loadGroup();
        }
    }, [groupId]);

    // Set up polling AFTER groupInfo is loaded
    useEffect(() => {
        if (!groupInfo) return;

        // Poll immediately on mount, then every 5 seconds for real-time feel
        pollForGroupMessages();
        const pollInterval = setInterval(() => {
            pollForGroupMessages();
        }, 5000);

        return () => clearInterval(pollInterval);
    }, [groupInfo]); // Restart interval when groupInfo changes

    const loadGroup = async () => {
        try {
            const info = await getGroupInfo(groupId!);
            setGroupInfo(info);

            const storedMessages = await getGroupMessages(groupId!);
            setMessages(storedMessages);

            // Track already processed Arweave IDs
            storedMessages.forEach(msg => {
                if (msg.arweaveTxId) {
                    processedArweaveIds.current.add(msg.arweaveTxId);
                }
            });
        } catch (error) {
            console.error('Failed to load group:', error);
            Alert.alert('Error', 'Failed to load group information');
        } finally {
            setIsLoading(false);
        }
    };

    const pollForGroupMessages = async () => {
        try {
            const keypair = await getStoredKeypair();
            if (!keypair || !groupInfo) return;

            const myPubkey = uint8ToBase58(keypair.publicKey);
            const encryptionKeypair = getEncryptionKeypair(keypair);

            const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
            const { messages: inboxMessages } = await fetchInbox(myPubkey, oneHourAgo);

            for (const msg of inboxMessages) {
                if (!msg.encryptedMessage.startsWith(`group:${groupId}:`)) continue;

                const arweaveTxId = msg.encryptedMessage.split(':')[2];
                if (processedArweaveIds.current.has(arweaveTxId)) continue;

                const arweaveResponse = await fetch(`https://devnet.irys.xyz/${arweaveTxId}`);
                if (!arweaveResponse.ok) continue;

                const messageData = JSON.parse(await arweaveResponse.text());

                const senderData = await getUsernameByOwner(messageData.senderPubkey);
                if (!senderData?.encryptionKey) continue;

                const decryptedText = decryptGroupMessage(
                    messageData.encryptedMessage,
                    messageData.encryptedKeys,
                    encryptionKeypair.publicKey,
                    encryptionKeypair.secretKey,
                    base64ToUint8(senderData.encryptionKey)
                );

                let messageType: 'text' | 'image' = 'text';
                let finalContent = decryptedText;
                let mimeType: string | undefined;
                let width: number | undefined;
                let height: number | undefined;

                if (decryptedText.startsWith('IMG:')) {
                    messageType = 'image';
                    const parts = decryptedText.substring(4).split(':');

                    if (parts.length === 4) {
                        mimeType = parts[0];
                        width = parseInt(parts[1], 10);
                        height = parseInt(parts[2], 10);
                        finalContent = parts[3];
                    } else {
                        finalContent = decryptedText.substring(4);
                        mimeType = 'image/jpeg';
                    }
                }

                const newMessage: GroupMessage = {
                    id: generateMessageId(),
                    chatId: groupId!,
                    groupId: groupId!,
                    type: messageType,
                    content: finalContent,
                    mimeType,
                    width,
                    height,
                    timestamp: messageData.timestamp,
                    isMine: messageData.senderPubkey === myPubkey,
                    status: 'confirmed',
                    senderPublicKey: messageData.senderPubkey,
                    senderUsername: senderData.username,
                    arweaveTxId: arweaveTxId,
                };

                await saveGroupMessage(newMessage);
                processedArweaveIds.current.add(arweaveTxId);
                setMessages(prev => [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp));

                if (!newMessage.isMine && Platform.OS !== 'web') {
                    const { scheduleNotificationAsync } = await import('expo-notifications');
                    await scheduleNotificationAsync({
                        content: {
                            title: `${groupInfo.name}`,
                            body: `${newMessage.senderUsername}: ${messageType === 'image' ? '📷 Photo' : finalContent.slice(0, 50)}`,
                            data: { groupId: groupId },
                            sound: 'default',
                        },
                        trigger: null,
                    });
                }
            }
        } catch (error) {
            console.error('Group message poll failed:', error);
        }
    };

    const handleSendMessage = async (text: string, imageData?: { base64: string; mimeType: string; width: number; height: number }) => {
        if (!groupInfo || (!text.trim() && !imageData)) return;

        setIsSending(true);

        try {
            const keypair = await getStoredKeypair();
            if (!keypair) {
                throw new Error('No identity found');
            }

            const myPubkey = uint8ToBase58(keypair.publicKey);
            const encryptionKeypair = getEncryptionKeypair(keypair);

            const memberEncryptionKeys: Uint8Array[] = [];
            for (const memberPubkey of groupInfo.members) {
                const memberData = await getUsernameByOwner(memberPubkey);

                if (memberData?.encryptionKey) {
                    memberEncryptionKeys.push(base64ToUint8(memberData.encryptionKey));
                } else {
                    console.warn(`No encryption key for member ${memberPubkey}`);
                }
            }

            if (memberEncryptionKeys.length === 0) {
                throw new Error('No valid member encryption keys found');
            }

            let contentToEncrypt = text;
            let messageType: 'text' | 'image' = 'text';
            let mimeType: string | undefined;
            let width: number | undefined;
            let height: number | undefined;

            if (imageData) {
                contentToEncrypt = `IMG:${imageData.mimeType}:${imageData.width}:${imageData.height}:${imageData.base64}`;
                messageType = 'image';
                mimeType = imageData.mimeType;
                width = imageData.width;
                height = imageData.height;
            }

            const { encryptedMessage, encryptedKeys } = encryptGroupMessage(
                contentToEncrypt,
                memberEncryptionKeys,
                encryptionKeypair.secretKey
            );

            const messageId = generateMessageId();
            const newMessage: GroupMessage = {
                id: messageId,
                chatId: groupId!,
                groupId: groupId!,
                type: messageType,
                content: imageData ? imageData.base64 : text,
                mimeType,
                width,
                height,
                timestamp: Date.now(),
                isMine: true,
                status: 'sending',
                senderPublicKey: myPubkey,
                senderUsername: 'You',
            };

            setMessages(prev => [...prev, newMessage]);

            const result = await sendGroupMessage(groupId!, encryptedMessage, encryptedKeys, myPubkey);

            newMessage.status = 'confirmed';
            newMessage.arweaveTxId = result.arweaveTxId;
            await saveGroupMessage(newMessage);

            setMessages(prev =>
                prev.map(m => m.id === messageId ? newMessage : m)
            );

            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }

            setTimeout(() => {
                listRef.current?.scrollToEnd({ animated: true });
            }, 100);
        } catch (error: any) {
            console.error('Send group message failed:', error);
            Alert.alert('Error', error.message || 'Failed to send message');

            setMessages(prev => prev.filter(m => m.status !== 'sending'));
        } finally {
            setIsSending(false);
        }
    };

    const handleShowGroupInfo = async () => {
        if (!groupInfo) return;

        try {
            const memberUsernames: string[] = [];
            for (const memberPubkey of groupInfo.members) {
                const memberData = await getUsernameByOwner(memberPubkey);
                memberUsernames.push(memberData?.username || memberPubkey.slice(0, 8) + '...');
            }

            Alert.alert(
                groupInfo.name,
                `Members (${groupInfo.members.length}):\n\n` + memberUsernames.map(u => `@${u}`).join('\n'),
                [{ text: 'Close' }]
            );
        } catch (error) {
            Alert.alert('Group Info', `${groupInfo.members.length} members`);
        }
    };

    const handleLeaveGroup = async () => {
        Alert.alert(
            'Leave Group',
            'Are you sure you want to leave this group?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Leave',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const keypair = await getStoredKeypair();
                            if (!keypair) return;

                            const myPubkey = uint8ToBase58(keypair.publicKey);
                            await leaveGroup(groupId!, myPubkey);

                            router.back();
                        } catch (error: any) {
                            Alert.alert('Error', error.message || 'Failed to leave group');
                        }
                    },
                },
            ]
        );
    };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        >
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTransparent: true,
                    headerTitle: () => (
                        <Pressable onPress={handleShowGroupInfo} style={styles.headerTitleContainer}>
                            <Text style={styles.headerTitle}>{groupInfo?.name || 'Group'}</Text>
                            <Text style={styles.headerSubtitle}>
                                {groupInfo?.members.length} members • tap for info
                            </Text>
                        </Pressable>
                    ),
                    headerLeft: () => (
                        <Pressable
                            onPress={() => router.back()}
                            style={styles.headerButton}
                        >
                            <Ionicons name="chevron-back" size={24} color={Colors.text} />
                        </Pressable>
                    ),
                    headerRight: () => (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable
                                onPress={() => router.push(`/group-settings/${groupId}`)}
                                style={styles.headerButton}
                            >
                                <Ionicons name="settings-outline" size={22} color={Colors.text} />
                            </Pressable>
                            <Pressable
                                onPress={handleLeaveGroup}
                                style={styles.headerButton}
                            >
                                <Ionicons name="exit-outline" size={22} color={Colors.error} />
                            </Pressable>
                        </View>
                    ),
                }}
            />

            {/* Chat Background */}
            <View style={[styles.chatBackground, { backgroundColor: Colors.background }]} />

            {/* Messages List */}
            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(msg) => msg.id}
                renderItem={({ item: msg, index }) => {
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

                    const isFirstInGroup = !prevMsg || prevMsg.senderPublicKey !== msg.senderPublicKey;
                    const isLastInGroup = !nextMsg || nextMsg.senderPublicKey !== msg.senderPublicKey;

                    return (
                        <View style={styles.messageContainer}>
                            {!msg.isMine && (
                                <Text style={styles.senderName}>{msg.senderUsername}</Text>
                            )}
                            {msg.type === 'image' ? (
                                <ImageBubble
                                    message={{
                                        ...msg,
                                        chatId: msg.groupId,
                                    }}
                                    isFirstInGroup={isFirstInGroup}
                                    isLastInGroup={isLastInGroup}
                                />
                            ) : (
                                <MessageBubble
                                    message={{
                                        ...msg,
                                        chatId: msg.groupId,
                                    }}
                                    isFirstInGroup={isFirstInGroup}
                                    isLastInGroup={isLastInGroup}
                                />
                            )}
                        </View>
                    );
                }}
                contentContainerStyle={[styles.messagesList, { paddingTop: insets.top + 56 }]}
                onScroll={({ nativeEvent }) => {
                    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
                    isNearBottom.current = contentOffset.y >= contentSize.height - layoutMeasurement.height - 120;
                }}
                scrollEventThrottle={16}
                onContentSizeChange={() => {
                    if (isNearBottom.current) {
                        listRef.current?.scrollToEnd({ animated: true });
                    }
                }}
                keyboardDismissMode="interactive"
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIcon}>
                            <Ionicons name="people" size={64} color={Colors.textMuted} />
                        </View>
                        <Text style={styles.emptyTitle}>Group created</Text>
                        <Text style={styles.emptySubtitle}>
                            Start the conversation!
                        </Text>
                    </View>
                }
            />

            {/* Chat Input */}
            <ChatInput
                onSendText={handleSendMessage}
                onSendImage={async (image) => {
                    await handleSendMessage('', {
                        base64: image.base64,
                        mimeType: image.mimeType,
                        width: image.width,
                        height: image.height,
                    });
                }}
                onEmojiPress={() => setEmojiPickerVisible(true)}
                pendingEmoji={pendingEmoji}
                onEmojiInserted={() => setPendingEmoji(null)}
                disabled={isSending}
                placeholder="Message group"
            />

            {/* Emoji Picker Modal */}
            <EmojiPicker
                visible={emojiPickerVisible}
                onClose={() => setEmojiPickerVisible(false)}
                onSelectEmoji={(code) => {
                    setPendingEmoji(code);
                    setEmojiPickerVisible(false);
                }}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
    },
    headerSubtitle: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: 2,
    },
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 8,
    },
    chatBackground: {
        ...StyleSheet.absoluteFillObject,
    },
    messagesList: {
        paddingBottom: 20,
        paddingHorizontal: 16,
        flexGrow: 1,
    },
    messageContainer: {
        marginBottom: 4,
    },
    senderName: {
        fontSize: 11,
        color: Colors.primary,
        marginLeft: 12,
        marginBottom: 2,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    inputContainer: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
        paddingHorizontal: 40,
    },
    emptyIcon: {
        marginBottom: 20,
        opacity: 0.3,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '300',
        color: Colors.text,
        marginBottom: 8,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    emptySubtitle: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
    },
});
