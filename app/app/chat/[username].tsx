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
    ActionSheetIOS,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import { MessageBubble } from '@/components/MessageBubble';
import { ImageBubble } from '@/components/ImageBubble';
import { ChatInput } from '@/components/ChatInput';
import { EmojiPicker } from '@/components/EmojiPicker';
import {
    getMessages,
    saveMessage,
    updateMessageStatus,
    generateMessageId,
    isSignatureProcessed,
    addProcessedSignature,
    clearChatUnreadCount,
    type Message,
} from '@/lib/storage';
import { encryptMessage, getEncryptionKeypair, base64ToUint8, uint8ToBase58 } from '@/lib/crypto';
import { getStoredKeypair } from '@/lib/keychain';
import { getPublicKeyByUsername } from '@/lib/api';
import { type CompressedImage } from '@/lib/imageUtils';
import { getUserSettings, type UserSettings } from '@/lib/settingsStorage';
import { markRead } from '@/lib/receipts';
import * as Haptics from 'expo-haptics';
import { ReportModal } from '@/components/ReportModal';
import { useResponsive, getChatContainerStyle } from '@/hooks/useResponsive';

export default function ChatScreen() {
    const { username } = useLocalSearchParams<{ username: string }>();
    const router = useRouter();
    const responsive = useResponsive();
    const [messages, setMessages] = useState<Message[]>([]);
    const [recipientPublicKey, setRecipientPublicKey] = useState<Uint8Array | null>(null);
    const [recipientSolanaPubkey, setRecipientSolanaPubkey] = useState<string | null>(null);
    const [isBlocked, setIsBlocked] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [pendingEmoji, setPendingEmoji] = useState<string | null>(null);
    const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
    const [backgroundColor, setBackgroundColor] = useState(Colors.background);
    const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [reportMessage, setReportMessage] = useState<{ signature: string; sender: string } | null>(null);
    const listRef = useRef<FlatList<Message>>(null);
    const processedSignatures = useRef<Set<string>>(new Set());

    useEffect(() => {
        clearChatUnreadCount(username!);
        loadChat();
        loadUserSettings();
        pollForMessages();
        const pollInterval = setInterval(() => {
            pollForMessages();
        }, 5000);
        return () => clearInterval(pollInterval);
    }, [username]);

    useEffect(() => {
        messages.forEach(msg => {
            if (!msg.isMine && msg.txSignature && msg.status === 'confirmed') {
                markRead(msg.txSignature).catch(err =>
                    console.log('Failed to send read receipt:', err)
                );
            }
        });
    }, [messages]);

    const loadChat = async () => {
        const storedMessages = await getMessages(username!);
        setMessages(storedMessages);
        storedMessages.forEach(msg => {
            if (msg.txSignature) {
                processedSignatures.current.add(msg.txSignature);
            }
        });
        const userData = await getPublicKeyByUsername(username!);
        console.log('📧 Loaded user data:', username, userData);
        if (userData?.encryptionKey) {
            setRecipientPublicKey(base64ToUint8(userData.encryptionKey));
            console.log('🔐 Encryption key loaded for', username);
        } else {
            console.warn('⚠️ No encryption key found for', username);
        }
        if (userData?.publicKey) {
            setRecipientSolanaPubkey(userData.publicKey);
            try {
                const keypair = await getStoredKeypair();
                if (keypair) {
                    const { checkBlocked } = await import('@/lib/api');
                    const myPubkey = uint8ToBase58(keypair.publicKey);
                    const blocked = await checkBlocked(myPubkey, userData.publicKey);
                    setIsBlocked(blocked);
                }
            } catch (e) {
                console.log('Block status check failed:', e);
            }
        }
    };

    const loadUserSettings = async () => {
        const settings = await getUserSettings();
        if (settings.chatBackgroundColor) {
            setBackgroundColor(settings.chatBackgroundColor);
        }
        if (settings.chatBackgroundImage) {
            setBackgroundImage(settings.chatBackgroundImage);
        }
    };

    const pollForMessages = async () => {
        try {
            const keypair = await getStoredKeypair();
            if (!keypair) return;
            const { fetchInbox, getUsernameByOwner } = await import('@/lib/api');
            const myPubkey = uint8ToBase58(keypair.publicKey);
            const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
            const { messages: inboxMessages } = await fetchInbox(myPubkey, oneHourAgo);
            if (inboxMessages.length === 0) return;
            const { decryptMessage, getEncryptionKeypair } = await import('@/lib/crypto');
            const encryptionKeypair = getEncryptionKeypair(keypair);
            for (const msg of inboxMessages) {
                const alreadyProcessed = await isSignatureProcessed(msg.signature);
                if (alreadyProcessed) continue;
                const senderData = await getUsernameByOwner(msg.senderPubkey);
                if (senderData?.username !== username) continue;
                if (!senderData?.encryptionKey) continue;
                const senderEncryptionKey = base64ToUint8(senderData.encryptionKey);
                try {
                    const decryptedText = decryptMessage(
                        msg.encryptedMessage,
                        senderEncryptionKey,
                        encryptionKeypair.secretKey
                    );
                    let finalContent = decryptedText;
                    if (finalContent.startsWith('ar:')) {
                        const arweaveTxId = finalContent.substring(3);
                        console.log('🌐 Fetching from Irys devnet:', arweaveTxId);
                        try {
                            const arweaveResponse = await fetch(`https://devnet.irys.xyz/${arweaveTxId}`);
                            if (arweaveResponse.ok) {
                                finalContent = await arweaveResponse.text();
                            } else {
                                finalContent = 'Error: Failed to fetch from Arweave';
                            }
                        } catch (fetchError) {
                            console.error('Arweave fetch error:', fetchError);
                            finalContent = 'Error: Arweave content unavailable';
                        }
                    }
                    let type: 'text' | 'image' = 'text';
                    let mimeType: string | undefined;
                    let width: number | undefined;
                    let height: number | undefined;
                    if (finalContent.startsWith('IMG:')) {
                        type = 'image';
                        const parts = finalContent.substring(4).split(':');
                        if (parts.length === 4) {
                            mimeType = parts[0];
                            width = parseInt(parts[1], 10);
                            height = parseInt(parts[2], 10);
                            finalContent = parts[3];
                        } else {
                            finalContent = finalContent.substring(4);
                            mimeType = 'image/jpeg';
                        }
                    }
                    console.log(`📩 Received ${type}:`, type === 'text' ? finalContent.slice(0, 20) : '(Image Data)');
                    const newMessage: Message = {
                        id: generateMessageId(),
                        chatId: username!,
                        type,
                        content: finalContent,
                        mimeType,
                        width,
                        height,
                        timestamp: msg.timestamp * 1000,
                        isMine: false,
                        status: 'confirmed',
                        txSignature: msg.signature,
                    };
                    await addProcessedSignature(msg.signature);
                    await saveMessage(newMessage);
                    setMessages(prev => [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp));
                    if (Platform.OS !== 'web') {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                } catch (decryptError) {
                    await addProcessedSignature(msg.signature);
                }
            }
        } catch (error) {
            console.error('Poll for messages failed:', error);
        }
    };

    const handleSendImage = async (image: CompressedImage) => {
        if (isBlocked) {
            Alert.alert('Blocked', 'You cannot send messages to a blocked user.');
            return;
        }
        if (!recipientPublicKey) {
            console.error('No recipient public key');
            return;
        }
        const messageId = generateMessageId();
        const newMessage: Message = {
            id: messageId,
            chatId: username!,
            type: 'image',
            content: image.base64,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            timestamp: Date.now(),
            isMine: true,
            status: 'sending',
        };
        setMessages((prev) => [...prev, newMessage]);
        await saveMessage(newMessage);
        setTimeout(() => {
            listRef.current?.scrollToEnd({ animated: true });
        }, 100);
        try {
            const keypair = await getStoredKeypair();
            if (!keypair) throw new Error('No keypair found');
            const encryptionKeypair = getEncryptionKeypair(keypair);
            const encryptedImage = encryptMessage(
                `IMG:${image.mimeType}:${image.width}:${image.height}:${image.base64}`,
                recipientPublicKey,
                encryptionKeypair.secretKey
            );
            console.log('📷 Encrypted image:', `${(encryptedImage.length / 1024).toFixed(1)} KB`);
            console.log('📤 Sending encrypted image to API...');
            const { sendMessage: sendMessageAPI } = await import('@/lib/api');
            const myPubkeyStr = uint8ToBase58(keypair.publicKey);
            const recipientPubkeyStr = recipientSolanaPubkey || uint8ToBase58(recipientPublicKey);
            const result = await sendMessageAPI(
                encryptedImage,
                recipientPubkeyStr,
                myPubkeyStr
            );
            console.log('✅ Image sent:', result.signature);
            await updateMessageStatus(username!, messageId, 'confirmed');
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === messageId ? { ...msg, status: 'confirmed', txSignature: result.signature } : msg
                )
            );
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (error) {
            console.error('Image send failed:', error);
            await updateMessageStatus(username!, messageId, 'failed');
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === messageId ? { ...msg, status: 'failed' } : msg
                )
            );
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
            if (error instanceof Error && error.message.includes('blocked')) {
                Alert.alert('Message Failed', 'This user has blocked you.');
            }
        }
    };

    const handleBlockToggle = async () => {
        if (!recipientSolanaPubkey) return;
        const keypair = await getStoredKeypair();
        if (!keypair) return;
        const myPubkey = uint8ToBase58(keypair.publicKey);
        const { blockUser, unblockUser } = await import('@/lib/api');
        if (isBlocked) {
            Alert.alert(
                'Unblock User',
                `Are you sure you want to unblock @${username}?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Unblock',
                        onPress: async () => {
                            try {
                                await unblockUser(myPubkey, recipientSolanaPubkey);
                                setIsBlocked(false);
                                if (Platform.OS !== 'web') {
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                }
                            } catch (error) {
                                Alert.alert('Error', 'Failed to unblock user');
                            }
                        }
                    }
                ]
            );
        } else {
            Alert.alert(
                'Block User',
                `Are you sure you want to block @${username}? They won't be able to message you.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Block',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                await blockUser(myPubkey, recipientSolanaPubkey);
                                setIsBlocked(true);
                                if (Platform.OS !== 'web') {
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                }
                                router.back();
                            } catch (error) {
                                Alert.alert('Error', 'Failed to block user');
                            }
                        }
                    }
                ]
            );
        }
    };

    const showActionSheet = () => {
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancel', isBlocked ? 'Unblock User' : 'Block User'],
                    destructiveButtonIndex: isBlocked ? -1 : 1,
                    cancelButtonIndex: 0,
                },
                (buttonIndex) => {
                    if (buttonIndex === 1) {
                        handleBlockToggle();
                    }
                }
            );
        } else {
            handleBlockToggle();
        }
    };

    const handleSend = async (text: string) => {
        if (isBlocked) {
            Alert.alert('Blocked', 'You cannot send messages to a blocked user.');
            return;
        }
        if (!recipientPublicKey) {
            if (Platform.OS === 'web') {
                alert(`Cannot send message: No encryption key found for @${username}. The user may need to re-register.`);
            } else {
                import('react-native').then(({ Alert }) => {
                    Alert.alert(
                        'Encryption Key Missing',
                        `Could not find an encryption key for @${username}. They may need to open the app or re-register.`
                    );
                });
            }
            return;
        }
        const { encryptMessage, getEncryptionKeypair } = await import('@/lib/crypto');
        const keypair = await getStoredKeypair();
        if (!keypair) {
            console.error('No keypair found');
            return;
        }
        const encryptionKeypair = getEncryptionKeypair(keypair);
        try {
            const tempId = generateMessageId();
            const tempMessage: Message = {
                id: tempId,
                chatId: username!,
                type: 'text',
                content: text,
                timestamp: Date.now(),
                isMine: true,
                status: 'sending',
            };
            setMessages(prev => [...prev, tempMessage]);
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            const encryptedData = encryptMessage(
                text,
                recipientPublicKey,
                encryptionKeypair.secretKey
            );
            console.log('📤 Sending encrypted message to API...');
            const { sendMessage } = await import('@/lib/api');
            const recipientPubkeyStr = recipientSolanaPubkey || '';
            const myPubkeyStr = uint8ToBase58(keypair.publicKey);
            await sendMessage(
                encryptedData,
                recipientPubkeyStr || uint8ToBase58(recipientPublicKey),
                myPubkeyStr
            );
            console.log(`✅ Message sent`);
            setMessages(prev =>
                prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m)
            );
            await saveMessage({ ...tempMessage, status: 'sent' });
        } catch (error) {
            console.error('Failed to send message:', error);
            setMessages(prev =>
                prev.map(m => m.type === 'text' && m.content === text ? { ...m, status: 'failed' } : m)
            );
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
            if (error instanceof Error && error.message.includes('blocked')) {
                Alert.alert('Message Failed', 'This user has blocked you.');
            }
        }
    };

    const handleReply = (message: Message) => {
        setReplyingTo(message);
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const renderItem = ({ item, index }: { item: Message; index: number }) => {
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
        const isFirstInGroup = !prevMessage || prevMessage.isMine !== item.isMine;
        const isLastInGroup = !nextMessage || nextMessage.isMine !== item.isMine;
        if (item.type === 'image') {
            return (
                <ImageBubble
                    message={item}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                />
            );
        }
        return (
            <MessageBubble
                message={item}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
                onReply={() => handleReply(item)}
                onDelete={() => setMessages(prev => prev.filter(m => m.id !== item.id))}
                onReport={() => {
                    if (!item.isMine && item.txSignature) {
                        setReportMessage({
                            signature: item.txSignature,
                            sender: recipientSolanaPubkey || ''
                        });
                        setReportModalVisible(true);
                    }
                }}
                messageSignature={item.txSignature}
                senderPublicKey={recipientSolanaPubkey}
            />
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior="padding"
            keyboardVerticalOffset={0}
        >
            {backgroundColor.startsWith('gradient:') ? (
                <LinearGradient
                    colors={JSON.parse(backgroundColor.replace('gradient: ', ''))}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
            ) : (
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor }]} />
            )}
            <Stack.Screen
                options={{
                    title: `@${username}`,
                    headerBackTitle: 'Back',
                    headerTitleAlign: 'center',
                    headerShadowVisible: false,
                    headerStyle: { backgroundColor: (backgroundColor.startsWith('gradient:') || backgroundColor === 'custom:camera') ? 'transparent' : Colors.background },
                    headerTransparent: backgroundColor.startsWith('gradient:') || backgroundColor === 'custom:camera',
                    headerTintColor: Colors.text,
                    headerTitleStyle: { fontWeight: '600' },
                    headerLeft: () => (
                        <Pressable
                            onPress={() => router.back()}
                            style={{ padding: 8 }}
                        >
                            <Ionicons name="chevron-back" size={28} color={Colors.text} />
                        </Pressable>
                    ),
                    headerRight: () => (
                        <Pressable
                            onPress={showActionSheet}
                            style={{ padding: 8 }}
                        >
                            <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
                        </Pressable>
                    ),
                    headerBackground: () => (
                        <BlurView
                            intensity={80}
                            style={StyleSheet.absoluteFill}
                            tint="dark"
                        />
                    ),
                }}
            />
            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={[styles.messageList, getChatContainerStyle(responsive)]}
                onContentSizeChange={() => {
                    listRef.current?.scrollToEnd({ animated: false });
                }}
                showsVerticalScrollIndicator={false}
            />
            {replyingTo && (
                <View style={styles.replyPreview}>
                    <View style={styles.replyBar} />
                    <View style={styles.replyContent}>
                        <Text style={styles.replyLabel}>Reply to</Text>
                        <Text style={styles.replyText} numberOfLines={1}>
                            {replyingTo.type === 'image' ? '📷 Photo' : replyingTo.content}
                        </Text>
                    </View>
                    <Text
                        style={styles.replyClear}
                        onPress={() => setReplyingTo(null)}
                    >
                        ✕
                    </Text>
                </View>
            )}
            <ChatInput
                onSend={handleSend}
                onSendImage={handleSendImage}
            />
            <ReportModal
                visible={reportModalVisible}
                onClose={() => setReportModalVisible(false)}
                messageSignature={reportMessage?.signature || ''}
                reportedPubkey={reportMessage?.sender || ''}
            />
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
    messageList: {
        paddingVertical: 16,
        paddingBottom: 8,
    },
    replyPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    replyBar: {
        width: 3,
        height: '100%',
        backgroundColor: Colors.primary,
        borderRadius: 2,
        marginRight: 12,
    },
    replyContent: {
        flex: 1,
    },
    replyLabel: {
        fontSize: 12,
        color: Colors.primary,
        fontWeight: '600',
    },
    replyText: {
        fontSize: 14,
        color: Colors.textSecondary,
    },
    replyClear: {
        fontSize: 16,
        color: Colors.textMuted,
        padding: 8,
    },
});
