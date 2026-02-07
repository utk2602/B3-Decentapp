import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    Pressable,
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { getGroupInfo, setGroupCode, getUsernameByOwner, type GroupInfo } from '@/lib/api';
import { getStoredKeypair } from '@/lib/keychain';
import { uint8ToBase58 } from '@/lib/crypto';

export default function GroupSettingsScreen() {
    const router = useRouter();
    const { groupId } = useLocalSearchParams<{ groupId: string }>();
    const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [publicCode, setPublicCode] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [memberUsernames, setMemberUsernames] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        loadGroupInfo();
    }, [groupId]);

    const loadGroupInfo = async () => {
        try {
            const keypair = await getStoredKeypair();
            if (!keypair) {
                throw new Error('No identity found');
            }

            const myPubkey = uint8ToBase58(keypair.publicKey);
            const info = await getGroupInfo(groupId!);
            setGroupInfo(info);
            setPublicCode(info.publicCode || '');
            setIsOwner(info.owner === myPubkey);

            // Load member usernames
            const usernameMap = new Map<string, string>();
            for (const memberPubkey of info.members) {
                try {
                    const userData = await getUsernameByOwner(memberPubkey);
                    if (userData?.username) {
                        usernameMap.set(memberPubkey, userData.username);
                    }
                } catch {
                    // Ignore errors for individual members
                }
            }
            setMemberUsernames(usernameMap);
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to load group info');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetCode = async () => {
        const trimmedCode = publicCode.trim().toLowerCase().replace('@', '');

        if (!trimmedCode) {
            setError('Please enter a public code');
            return;
        }

        if (trimmedCode.length < 3) {
            setError('Code must be at least 3 characters');
            return;
        }

        if (!/^[a-z0-9_]+$/.test(trimmedCode)) {
            setError('Code can only contain letters, numbers, and underscores');
            return;
        }

        setIsSaving(true);
        setError('');

        try {
            const keypair = await getStoredKeypair();
            if (!keypair) {
                throw new Error('No identity found');
            }

            const ownerPubkey = uint8ToBase58(keypair.publicKey);
            await setGroupCode(groupId!, trimmedCode, ownerPubkey);

            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }

            Alert.alert(
                'Success',
                `Public code @${trimmedCode} set! Anyone can now join this group.`,
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (error: any) {
            setError(error.message || 'Failed to set public code');
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    if (!groupInfo) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.errorText}>Group not found</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTransparent: true,
                    headerTitle: () => (
                        <Text style={styles.headerTitle}>Group Settings</Text>
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

                {/* Group Name */}
                <Text style={styles.groupName}>{groupInfo.name}</Text>
                {groupInfo.description && (
                    <Text style={styles.groupDescription}>{groupInfo.description}</Text>
                )}

                {/* Members Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>MEMBERS ({groupInfo.members.length})</Text>
                    <View style={styles.membersList}>
                        {groupInfo.members.map((memberPubkey) => (
                            <View key={memberPubkey} style={styles.memberItem}>
                                <View style={styles.memberAvatar}>
                                    <Text style={styles.memberAvatarText}>
                                        {(memberUsernames.get(memberPubkey) || 'U')[0].toUpperCase()}
                                    </Text>
                                </View>
                                <Text style={styles.memberName}>
                                    @{memberUsernames.get(memberPubkey) || memberPubkey.slice(0, 8)}
                                </Text>
                                {memberPubkey === groupInfo.owner && (
                                    <View style={styles.ownerBadge}>
                                        <Text style={styles.ownerBadgeText}>Owner</Text>
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                </View>

                {/* Public Code Section (Owner Only) */}
                {isOwner && (
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>PUBLIC CODE</Text>
                        <Text style={styles.sectionDescription}>
                            Set a @code so anyone can find and join this group
                        </Text>

                        <View style={styles.codeInputContainer}>
                            <Text style={styles.atSymbol}>@</Text>
                            <TextInput
                                style={styles.codeInput}
                                value={publicCode}
                                onChangeText={(text) => {
                                    setPublicCode(text.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase());
                                    setError('');
                                }}
                                placeholder="groupcode"
                                placeholderTextColor={Colors.textMuted}
                                autoCapitalize="none"
                                autoCorrect={false}
                                maxLength={20}
                            />
                        </View>

                        {error && <Text style={styles.error}>{error}</Text>}

                        <Pressable
                            style={({ pressed }) => [
                                styles.button,
                                isSaving && styles.buttonDisabled,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={handleSetCode}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator color={Colors.background} />
                            ) : (
                                <Text style={styles.buttonText}>
                                    {groupInfo.publicCode ? 'Update Code' : 'Set Code'}
                                </Text>
                            )}
                        </Pressable>

                        {groupInfo.publicCode && (
                            <View style={styles.infoBox}>
                                <Ionicons name="information-circle" size={16} color={Colors.primary} />
                                <Text style={styles.infoText}>
                                    Current code: @{groupInfo.publicCode}
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Group Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>GROUP INFO</Text>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Group ID:</Text>
                        <Text style={styles.infoValue}>{groupId!.slice(0, 16)}...</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Public:</Text>
                        <Text style={styles.infoValue}>{groupInfo.isPublic ? 'Yes' : 'No'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Source:</Text>
                        <Text style={styles.infoValue}>{groupInfo.source || 'unknown'}</Text>
                    </View>
                </View>
            </ScrollView>
        </View>
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
        marginBottom: 16,
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
    groupName: {
        fontSize: 24,
        fontWeight: '300',
        color: Colors.text,
        textAlign: 'center',
        marginBottom: 8,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    groupDescription: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        marginBottom: 32,
    },
    section: {
        marginBottom: 32,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.primary,
        letterSpacing: 2,
        marginBottom: 12,
        marginLeft: 4,
    },
    sectionDescription: {
        fontSize: 13,
        color: Colors.textMuted,
        marginBottom: 16,
        marginLeft: 4,
    },
    membersList: {
        gap: 8,
    },
    memberItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        padding: 12,
        gap: 12,
    },
    memberAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
    },
    memberAvatarText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.primary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    memberName: {
        flex: 1,
        fontSize: 15,
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    ownerBadge: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    ownerBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.background,
        letterSpacing: 1,
    },
    codeInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    atSymbol: {
        fontSize: 18,
        color: Colors.primary,
        marginRight: 6,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    codeInput: {
        flex: 1,
        fontSize: 16,
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    error: {
        color: Colors.error,
        fontSize: 13,
        marginBottom: 16,
        marginLeft: 4,
    },
    button: {
        backgroundColor: Colors.primary,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 16,
    },
    buttonPressed: {
        opacity: 0.8,
    },
    buttonDisabled: {
        opacity: 0.4,
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.background,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primaryMuted,
        borderRadius: 8,
        padding: 12,
        gap: 8,
    },
    infoText: {
        fontSize: 13,
        color: Colors.primary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    infoLabel: {
        fontSize: 14,
        color: Colors.textMuted,
    },
    infoValue: {
        fontSize: 14,
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    errorText: {
        fontSize: 16,
        color: Colors.error,
    },
});
