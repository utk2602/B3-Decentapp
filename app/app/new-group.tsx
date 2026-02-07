import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    Pressable,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    ScrollView,
    FlatList,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { createGroupSimple, inviteToGroup, getPublicKeyByUsername } from '@/lib/api';
import { getStoredKeypair } from '@/lib/keychain';
import { uint8ToBase58 } from '@/lib/crypto';
import { getChats, saveChat, type Chat } from '@/lib/storage';

interface Member {
    username: string;
    publicKey: string;
}

export default function NewGroupScreen() {
    const router = useRouter();
    const [groupName, setGroupName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');
    const [suggestions, setSuggestions] = useState<Chat[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        loadSuggestions();
    }, []);

    const loadSuggestions = async () => {
        const chats = await getChats();
        const oneOnOneChats = chats.filter(c => !c.isGroup && c.username);
        setSuggestions(oneOnOneChats);
    };

    const handleSearch = async () => {
        const trimmed = searchQuery.trim().toLowerCase();
        if (!trimmed) return;

        setIsSearching(true);
        setError('');

        try {
            const user = await getPublicKeyByUsername(trimmed);

            if (!user) {
                setError('User not found');
                if (Platform.OS !== 'web') {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                }
                setIsSearching(false);
                return;
            }

            // Check if already selected
            if (selectedMembers.some(m => m.username === trimmed)) {
                setError('User already added');
                setIsSearching(false);
                return;
            }

            setSelectedMembers(prev => [...prev, { username: trimmed, publicKey: user.publicKey }]);
            setSearchQuery('');
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (err) {
            setError('Failed to find user');
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectFromSuggestions = (chat: Chat) => {
        if (!chat.username || !chat.publicKey) return;

        if (selectedMembers.some(m => m.username === chat.username)) {
            setError('User already added');
            return;
        }

        setSelectedMembers(prev => [...prev, { username: chat.username!, publicKey: chat.publicKey! }]);
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const handleRemoveMember = (username: string) => {
        setSelectedMembers(prev => prev.filter(m => m.username !== username));
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const handleCreateGroup = async () => {
        const trimmedName = groupName.trim();
        if (!trimmedName) {
            setError('Group name is required');
            return;
        }

        if (selectedMembers.length === 0) {
            setError('Add at least one member');
            return;
        }

        setIsCreating(true);
        setError('');

        try {
            const keypair = await getStoredKeypair();
            if (!keypair) {
                throw new Error('No identity found');
            }

            const ownerPubkey = uint8ToBase58(keypair.publicKey);

            // Create group
            const result = await createGroupSimple(trimmedName, ownerPubkey);

            // Invite all selected members
            await Promise.all(
                selectedMembers.map(member =>
                    inviteToGroup(result.groupId, member.publicKey, ownerPubkey)
                )
            );

            // Save group to local storage
            await saveChat({
                isGroup: true,
                groupId: result.groupId,
                groupName: trimmedName,
                participants: [ownerPubkey, ...selectedMembers.map(m => m.publicKey)],
                unreadCount: 0,
            });

            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            router.replace(`/group/${result.groupId}`);
        } catch (err: any) {
            setError(err.message || 'Failed to create group');
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
            setIsCreating(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior="padding"
            keyboardVerticalOffset={0}
        >
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTransparent: true,
                    headerTitle: () => (
                        <Text style={styles.headerTitle}>New Group</Text>
                    ),
                    headerLeft: () => (
                        <Pressable
                            onPress={() => router.back()}
                            style={styles.closeButton}
                        >
                            <Ionicons name="close" size={20} color={Colors.text} />
                        </Pressable>
                    ),
                }}
            />

            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
                {/* Group Icon */}
                <View style={styles.iconContainer}>
                    <View style={styles.groupIcon}>
                        <Ionicons name="people" size={40} color={Colors.primary} />
                    </View>
                </View>

                {/* Group Name Input */}
                <View style={styles.formSection}>
                    <Text style={styles.label}>GROUP NAME</Text>
                    <TextInput
                        style={styles.input}
                        value={groupName}
                        onChangeText={(text) => {
                            setGroupName(text);
                            setError('');
                        }}
                        placeholder="Enter group name"
                        placeholderTextColor={Colors.textMuted}
                        autoCorrect={false}
                        autoFocus
                        maxLength={30}
                    />
                </View>

                {/* Add Members Section */}
                <View style={styles.formSection}>
                    <Text style={styles.label}>ADD MEMBERS</Text>
                    <View style={styles.searchContainer}>
                        <Text style={styles.atSymbol}>@</Text>
                        <TextInput
                            style={styles.searchInput}
                            value={searchQuery}
                            onChangeText={(text) => {
                                setSearchQuery(text.replace(/[^a-zA-Z0-9_]/g, ''));
                                setError('');
                            }}
                            placeholder="username"
                            placeholderTextColor={Colors.textMuted}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="search"
                            onSubmitEditing={handleSearch}
                        />
                        {isSearching ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                            <Pressable onPress={handleSearch}>
                                <Ionicons name="add-circle" size={24} color={Colors.primary} />
                            </Pressable>
                        )}
                    </View>

                    {/* Selected Members */}
                    {selectedMembers.length > 0 && (
                        <View style={styles.selectedMembers}>
                            {selectedMembers.map((member) => (
                                <View key={member.username} style={styles.memberChip}>
                                    <Text style={styles.memberChipText}>@{member.username}</Text>
                                    <Pressable onPress={() => handleRemoveMember(member.username)}>
                                        <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                                    </Pressable>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Suggestions from Contacts */}
                    {suggestions.length > 0 && selectedMembers.length < 10 && (
                        <View style={styles.suggestionsSection}>
                            <Text style={styles.suggestionsLabel}>FROM CONTACTS</Text>
                            {suggestions.slice(0, 5).map((chat) => (
                                <Pressable
                                    key={chat.username}
                                    style={styles.suggestionItem}
                                    onPress={() => handleSelectFromSuggestions(chat)}
                                >
                                    <View style={styles.suggestionAvatar}>
                                        <Text style={styles.suggestionAvatarText}>
                                            {chat.username![0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <Text style={styles.suggestionUsername}>@{chat.username}</Text>
                                    <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                    style={({ pressed }) => [
                        styles.button,
                        (!groupName.trim() || selectedMembers.length === 0 || isCreating) && styles.buttonDisabled,
                        pressed && styles.buttonPressed,
                    ]}
                    onPress={handleCreateGroup}
                    disabled={!groupName.trim() || selectedMembers.length === 0 || isCreating}
                >
                    {isCreating ? (
                        <ActivityIndicator color={Colors.background} />
                    ) : (
                        <Text style={styles.buttonText}>Create Group</Text>
                    )}
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '300',
        color: Colors.text,
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 100,
        paddingBottom: 40,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    groupIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: Colors.primary,
    },
    formSection: {
        marginBottom: 24,
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.primary,
        letterSpacing: 2,
        marginBottom: 12,
        marginLeft: 4,
    },
    input: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 18,
        fontSize: 18,
        color: Colors.text,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    atSymbol: {
        fontSize: 18,
        color: Colors.primary,
        marginRight: 6,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    selectedMembers: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 12,
        gap: 8,
    },
    memberChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primaryMuted,
        borderRadius: 20,
        paddingVertical: 6,
        paddingHorizontal: 12,
        gap: 6,
    },
    memberChipText: {
        fontSize: 14,
        color: Colors.primary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    suggestionsSection: {
        marginTop: 20,
    },
    suggestionsLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: Colors.textMuted,
        letterSpacing: 1.5,
        marginBottom: 10,
        marginLeft: 4,
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
        gap: 12,
    },
    suggestionAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
    },
    suggestionAvatarText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.primary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    suggestionUsername: {
        flex: 1,
        fontSize: 15,
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    error: {
        color: Colors.error,
        fontSize: 13,
        marginBottom: 20,
        marginLeft: 4,
    },
    button: {
        backgroundColor: Colors.primary,
        paddingVertical: 18,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        marginTop: 12,
    },
    buttonPressed: {
        transform: [{ scale: 0.98 }],
        opacity: 0.9,
    },
    buttonDisabled: {
        opacity: 0.4,
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.background,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
});
