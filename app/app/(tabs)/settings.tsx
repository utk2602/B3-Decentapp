import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Alert,
    ScrollView,
    Platform,
    Linking,
    Image,
    TextInput,
    ActivityIndicator,
    Switch,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { getStoredUsername, getStoredKeypair, deleteIdentity, setIdentitySyncMode } from '@/lib/keychain';
import { clearAllData } from '@/lib/storage';
import { pickImage, requestMediaPermissions } from '@/lib/imageUtils';
import { uint8ToBase58 } from '@/lib/crypto';
import { fetchConfig, releaseUsername, uploadAvatar, buildReleaseTransaction, type AppConfig } from '@/lib/api';
import { type CompressedImage } from '@/lib/imageUtils';
import { getUserSettings, saveUserSettings, CHAT_BACKGROUND_PRESETS, type UserSettings } from '@/lib/settingsStorage';
import { useResponsive, getContentContainerStyle } from '@/hooks/useResponsive';
import { configureDMS, checkinDMS, getDMSStatus, disableDMS, type DMSRecipientInput, type DMSStatusResult } from '@/lib/deadswitch';
import { getLocalContacts } from '@/lib/contacts';

export default function SettingsScreen() {
    const router = useRouter();
    const responsive = useResponsive();
    const [username, setUsername] = useState<string | null>(null);
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
    const [userSettings, setUserSettings] = useState<UserSettings>({});
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [isTogglingEphemeral, setIsTogglingEphemeral] = useState(false);

    // ── Dead Man's Switch state ──
    const [dmsEnabled, setDmsEnabled] = useState(false);
    const [dmsInterval, setDmsInterval] = useState<number>(24); // default 24h
    const [dmsRecipients, setDmsRecipients] = useState<DMSRecipientInput[]>([]);
    const [dmsStatus, setDmsStatus] = useState<DMSStatusResult | null>(null);
    const [dmsLoading, setDmsLoading] = useState(false);
    const [dmsNewUsername, setDmsNewUsername] = useState('');
    const [dmsNewMessage, setDmsNewMessage] = useState('');
    const [contactUsernames, setContactUsernames] = useState<string[]>([]);

    useEffect(() => {
        loadIdentity();
        loadConfig();
        loadUserSettings();
        loadContacts();
    }, []);

    // Fetch DMS status whenever publicKey is loaded
    useEffect(() => {
        if (publicKey) loadDMSStatus();
    }, [publicKey]);

    const loadUserSettings = async () => {
        const settings = await getUserSettings();
        setUserSettings(settings);
        if (settings.avatarBase64) {
            setAvatarUri(`data:image/jpeg;base64,${settings.avatarBase64}`);
        }
        // Restore DMS state from local settings
        if (settings.dmsEnabled) setDmsEnabled(true);
        if (settings.dmsIntervalHours !== undefined) setDmsInterval(settings.dmsIntervalHours);
        if (settings.dmsRecipients) setDmsRecipients(settings.dmsRecipients);
    };

    const loadContacts = async () => {
        try {
            const contacts = await getLocalContacts();
            setContactUsernames(contacts.map(c => c.username));
        } catch { /* ignore */ }
    };

    const loadDMSStatus = async () => {
        if (!publicKey) return;
        try {
            const status = await getDMSStatus(publicKey);
            setDmsStatus(status);
            if (status.enabled && !dmsEnabled) setDmsEnabled(true);
        } catch { /* ignore */ }
    };

    const DMS_INTERVALS: { label: string; value: number }[] = [
        { label: '10 sec (test)', value: 0 },
        { label: '12 hours', value: 12 },
        { label: '24 hours', value: 24 },
        { label: '48 hours', value: 48 },
        { label: '72 hours', value: 72 },
        { label: '7 days', value: 168 },
    ];

    const handleDMSSave = async () => {
        if (dmsRecipients.length === 0) {
            Alert.alert('No recipients', 'Add at least one recipient before enabling the Dead Man\'s Switch.');
            return;
        }
        setDmsLoading(true);
        try {
            await configureDMS(dmsInterval, dmsRecipients);
            await saveUserSettings({
                dmsEnabled: true,
                dmsIntervalHours: dmsInterval,
                dmsRecipients,
            });
            setDmsEnabled(true);
            await loadDMSStatus();
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('✅ Dead Man\'s Switch armed', `Messages will be delivered if you don't check in within ${dmsInterval === 0 ? '10 seconds' : dmsInterval + ' hours'}.`);
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to configure Dead Man\'s Switch');
        } finally {
            setDmsLoading(false);
        }
    };

    const handleDMSCheckin = async () => {
        setDmsLoading(true);
        try {
            await checkinDMS();
            await loadDMSStatus();
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('💓 Checked in', 'Timer has been reset.');
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Check-in failed');
        } finally {
            setDmsLoading(false);
        }
    };

    const handleDMSDisable = async () => {
        Alert.alert(
            'Disable Dead Man\'s Switch?',
            'All scheduled messages will be deleted from the server.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disable',
                    style: 'destructive',
                    onPress: async () => {
                        setDmsLoading(true);
                        try {
                            await disableDMS();
                            await saveUserSettings({ dmsEnabled: false, dmsIntervalHours: undefined, dmsRecipients: undefined });
                            setDmsEnabled(false);
                            setDmsStatus(null);
                            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        } catch (err: any) {
                            Alert.alert('Error', err.message || 'Failed to disable');
                        } finally {
                            setDmsLoading(false);
                        }
                    },
                },
            ],
        );
    };

    const addDMSRecipient = () => {
        const u = dmsNewUsername.trim().replace('@', '');
        const m = dmsNewMessage.trim();
        if (!u) { Alert.alert('Enter a username'); return; }
        if (!m) { Alert.alert('Enter a message'); return; }
        if (dmsRecipients.find(r => r.username === u)) { Alert.alert('Duplicate', 'This recipient is already added.'); return; }
        setDmsRecipients(prev => [...prev, { username: u, message: m }]);
        setDmsNewUsername('');
        setDmsNewMessage('');
    };

    const removeDMSRecipient = (username: string) => {
        setDmsRecipients(prev => prev.filter(r => r.username !== username));
    };

    const loadConfig = async () => {
        const config = await fetchConfig();
        setAppConfig(config);
    };

    const loadIdentity = async () => {
        const [storedUsername, keypair] = await Promise.all([
            getStoredUsername(),
            getStoredKeypair(),
        ]);
        setUsername(storedUsername);
        if (keypair) {
            setPublicKey(uint8ToBase58(keypair.publicKey));
        }
    };

    const handleAvatarPress = async () => {
        const image = await pickImage();
        if (image) {
            // Optimistic update
            setAvatarUri(`data:${image.mimeType};base64,${image.base64}`);
            await saveUserSettings({ avatarBase64: image.base64 });

            // Sync to API
            if (username) {
                try {
                    await uploadAvatar(username, image.base64);
                    console.log('✅ Avatar synced to cloud');
                } catch (error) {
                    console.error('Failed to sync avatar:', error);
                    // We don't revert local change, as it's still valid locally
                }
            }

            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        }
    };

    const handleBackgroundSelect = async (color: string) => {
        await saveUserSettings({ chatBackgroundColor: color });
        setUserSettings(prev => ({ ...prev, chatBackgroundColor: color }));
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const handleCustomBackground = async () => {
        const image = await pickImage();
        if (image) {
            const imageUri = `data:${image.mimeType};base64,${image.base64}`;
            await saveUserSettings({ chatBackgroundImage: imageUri });
            setUserSettings(prev => ({ ...prev, chatBackgroundImage: imageUri }));
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        }
    };

    const handleEphemeralToggle = async (value: boolean) => {
        if (value) {
            // Show warning when enabling ephemeral mode
            Alert.alert(
                '⚠️ Auto-Burn on Uninstall',
                'When enabled, your identity is stored locally only. If you delete the app, your identity will be PERMANENTLY LOST and cannot be recovered.\n\nYou will lose access to:\n• Your username\n• All message history\n• Your cryptographic keys',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Enable',
                        style: 'destructive',
                        onPress: async () => {
                            await toggleEphemeralMode(true);
                        },
                    },
                ]
            );
        } else {
            await toggleEphemeralMode(false);
        }
    };

    const toggleEphemeralMode = async (ephemeral: boolean) => {
        setIsTogglingEphemeral(true);
        try {
            const success = await setIdentitySyncMode(ephemeral);
            if (success) {
                await saveUserSettings({ ephemeralMode: ephemeral });
                setUserSettings(prev => ({ ...prev, ephemeralMode: ephemeral }));
                if (Platform.OS !== 'web') {
                    Haptics.notificationAsync(
                        ephemeral
                            ? Haptics.NotificationFeedbackType.Warning
                            : Haptics.NotificationFeedbackType.Success
                    );
                }
            } else {
                Alert.alert('Error', 'Failed to change identity sync mode. Please try again.');
            }
        } catch (error) {
            console.error('Failed to toggle ephemeral mode:', error);
            Alert.alert('Error', 'An unexpected error occurred.');
        } finally {
            setIsTogglingEphemeral(false);
        }
    };

    const handleBurnIdentity = () => {
        if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        Alert.alert(
            'Burn Identity',
            'This will permanently delete your keys and all messages. Your username will be released for others to claim.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Burn',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // Release username first (adds .XX suffix like Signal)
                            if (username && username.trim()) {
                                // 1. Get keys
                                const keypair = await getStoredKeypair();
                                if (!keypair) {
                                    throw new Error('No identity keys found');
                                }
                                const ownerPublicKey = uint8ToBase58(keypair.publicKey);

                                console.log('🔥 Burning identity:', { username, ownerPublicKey });

                                // 2. Build transaction (unsigned)
                                const { transaction: unsignedTx } = await buildReleaseTransaction(username.trim(), ownerPublicKey);

                                // 3. Sign transaction
                                const { signTransaction } = await import('@/lib/crypto');
                                const signedTx = signTransaction(unsignedTx, keypair.secretKey);

                                // 4. Submit signed transaction
                                await releaseUsername(username.trim(), signedTx);
                                console.log(`🔄 Username @${username} released`);
                            }
                        } catch (err) {
                            // Continue even if release fails (might be offline)
                            console.warn('Username release failed:', err);
                            Alert.alert('Release Failed', 'Could not release username onchain, but local data will be cleared.');
                        }

                        await deleteIdentity();
                        await clearAllData();
                        if (Platform.OS !== 'web') {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                        router.replace('/onboarding?bypass=true');
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            {/* Subtle Renaissance Background Element */}
            <View style={styles.backgroundArt}>
                <Text style={styles.watermark}>⚿</Text>
            </View>

             {/* Glass Header - Compact */}
            <BlurView intensity={20} tint="dark" style={styles.header}>
                <View style={[styles.headerContent, responsive.isLargeScreen && { maxWidth: responsive.contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
                    <Text style={styles.headerTitle}>Settings</Text>
                </View>
            </BlurView>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, getContentContainerStyle(responsive)]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.mainContent}>
                {/* Identity Card - Compacted */}
                <View style={[styles.card, styles.identityCard]}>
                    <View style={styles.cardHeader}>
                        <Pressable onPress={handleAvatarPress}>
                            <View style={styles.avatar}>
                                {avatarUri ? (
                                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                                ) : (
                                    <Text style={styles.avatarText}>
                                        {username?.slice(0, 2).toUpperCase() || '??'}
                                    </Text>
                                )}
                                <View style={styles.avatarEditBadge}>
                                    <Ionicons name="camera" size={10} color={Colors.text} />
                                </View>
                            </View>
                        </Pressable>
                        <View style={styles.identityInfo}>
                            <Text style={styles.username}>@{username || 'unknown'}</Text>
                            <View style={styles.networkBadge}>
                                <View style={[
                                    styles.networkDot,
                                    appConfig?.network === 'mainnet-beta' && { backgroundColor: Colors.primary }
                                ]} />
                                <Text style={styles.networkText}>
                                    {appConfig?.network === 'mainnet-beta' ? 'MAINNET' : 'DEVNET'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {publicKey && (
                        <View style={styles.publicKeyContainer}>
                            <Text style={styles.publicKeyLabel}>PUBLIC IDENTITY KEY</Text>
                            <View style={styles.keyBox}>
                                <Text style={styles.publicKey} numberOfLines={1}>
                                    {publicKey}
                                </Text>
                                <Ionicons name="copy-outline" size={12} color={Colors.primary} />
                            </View>
                        </View>
                    )}
                </View>

                {/* Appearance Section */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Appearance</Text>
                    <Text style={styles.settingLabel}>Chat Background</Text>
                    <View style={styles.colorRow}>
                        {CHAT_BACKGROUND_PRESETS.map((color) => {
                            const isGradient = color.startsWith('gradient:');
                            const isCamera = color === 'custom:camera';

                            return (
                                <Pressable
                                    key={color}
                                    style={[
                                        styles.colorSwatch,
                                        userSettings.chatBackgroundColor === color && styles.colorSwatchSelected,
                                        !isGradient && !isCamera && { backgroundColor: color },
                                        isCamera && { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A1A' }
                                    ]}
                                    onPress={() => {
                                        if (isCamera) {
                                            handleCustomBackground();
                                        } else {
                                            handleBackgroundSelect(color);
                                        }
                                    }}
                                >
                                    {isGradient && (
                                        <LinearGradient
                                            colors={JSON.parse(color.replace('gradient: ', ''))}
                                            style={StyleSheet.absoluteFill}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                        />
                                    )}
                                    {isCamera && (
                                        <Ionicons name="camera-outline" size={18} color={Colors.textMuted} />
                                    )}
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {/* Auto-burn Section - Same width as boxes above */}
                {Platform.OS !== 'web' && (
                    <View style={styles.compactGrid}>
                        <View style={styles.gridFull}>
                            <Text style={styles.sectionTitle}>Identity Sync</Text>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.ephemeralCard,
                                    userSettings.ephemeralMode && styles.ephemeralCardActive,
                                    pressed && styles.ephemeralCardPressed,
                                ]}
                                onPress={() => handleEphemeralToggle(!userSettings.ephemeralMode)}
                                disabled={isTogglingEphemeral}
                            >
                                <View style={styles.ephemeralCardContent}>
                                    <Ionicons
                                        name="flame-outline"
                                        size={22}
                                        color={userSettings.ephemeralMode ? Colors.error : Colors.primary}
                                    />
                                    <View style={styles.ephemeralCardText}>
                                        <Text style={styles.ephemeralCardTitle}>
                                            Auto-burn on Uninstall
                                        </Text>
                                        <Text style={styles.ephemeralCardSubtitle}>
                                            {userSettings.ephemeralMode ? 'Local only - keys deleted on uninstall' : 'iCloud sync - keys backed up'}
                                        </Text>
                                    </View>
                                </View>
                                <Ionicons
                                    name={userSettings.ephemeralMode ? "checkmark-circle" : "ellipse-outline"}
                                    size={26}
                                    color={userSettings.ephemeralMode ? Colors.error : Colors.textMuted}
                                />
                            </Pressable>
                        </View>
                    </View>
                )}

                {/* Combined System Sections for compactness */}
                <View style={styles.compactGrid}>
                    <View style={styles.gridHalf}>
                        <Text style={styles.sectionTitle}>Security</Text>
                        <View style={styles.cardCompact}>
                            <Pressable onPress={() => Alert.alert(
                                '🔐 End-to-End Encryption',
                                'All messages are encrypted using X25519-XSalsa20-Poly1305 (NaCl Box). Only you and your recipient can read messages.'
                            )}>
                                <SettingsRow
                                    icon="shield-checkmark-outline"
                                    title="Encrypted"
                                    showChevron={true}
                                    compact
                                />
                            </Pressable>
                            <View style={styles.divider} />
                            <Pressable onPress={() => Alert.alert(
                                '🔑 Self-Custody Keys',
                                'Your keys are stored only on your device. No one else has access - not even us. You are the sole owner of your identity.'
                            )}>
                                <SettingsRow
                                    icon="key-outline"
                                    title="Sovereign"
                                    showChevron={true}
                                    compact
                                />
                            </Pressable>
                        </View>
                    </View>

                    <View style={styles.gridHalf}>
                        <Text style={styles.sectionTitle}>Protocol</Text>
                        <View style={styles.cardCompact}>
                            <SettingsRow
                                icon="git-branch-outline"
                                title={`v${appConfig?.version || '1.0.0'}`}
                                showChevron={false}
                                compact
                            />
                            <View style={styles.divider} />
                            <Pressable onPress={() => {
                                const url = appConfig?.githubUrl || 'https://github.com/serpepe/KeyApp';
                                Linking.openURL(url);
                            }}>
                                <SettingsRow
                                    icon="logo-github"
                                    title="Source"
                                    showChevron={true}
                                    compact
                                />
                            </Pressable>
                        </View>
                    </View>
                </View>

                {/* ── Dead Man's Switch Section ── */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Dead Man's Switch</Text>
                    <Text style={[styles.settingLabel, { marginBottom: 12 }]}>
                        Automatically deliver messages to chosen contacts if you stop checking in.
                    </Text>

                    {/* Status bar when active */}
                    {dmsStatus?.enabled && (
                        <View style={[styles.dmsStatusBar, dmsStatus.triggered && styles.dmsStatusTriggered]}>
                            <Ionicons
                                name={dmsStatus.triggered ? 'alert-circle' : dmsStatus.lastSeenAlive ? 'pulse' : 'time-outline'}
                                size={16}
                                color={dmsStatus.triggered ? Colors.error : Colors.accent}
                            />
                            <Text style={[styles.dmsStatusText, dmsStatus.triggered && { color: Colors.error }]}>
                                {dmsStatus.triggered
                                    ? 'TRIGGERED – messages delivered'
                                    : dmsStatus.lastSeenAlive
                                        ? `Active · ${dmsStatus.recipientCount} recipient${dmsStatus.recipientCount !== 1 ? 's' : ''}`
                                        : 'Countdown expired – awaiting delivery'
                                }
                            </Text>
                        </View>
                    )}

                    {/* Interval picker */}
                    <Text style={[styles.settingLabel, { marginTop: 8 }]}>Check-in interval</Text>
                    <View style={styles.dmsIntervalRow}>
                        {DMS_INTERVALS.map(iv => (
                            <Pressable
                                key={iv.value}
                                style={[
                                    styles.dmsIntervalChip,
                                    dmsInterval === iv.value && styles.dmsIntervalChipSelected,
                                ]}
                                onPress={() => setDmsInterval(iv.value)}
                            >
                                <Text style={[
                                    styles.dmsIntervalChipText,
                                    dmsInterval === iv.value && styles.dmsIntervalChipTextSelected,
                                ]}>
                                    {iv.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    {/* Recipients */}
                    <Text style={[styles.settingLabel, { marginTop: 14 }]}>Recipients</Text>
                    {dmsRecipients.map((r, idx) => (
                        <View key={r.username} style={styles.dmsRecipientRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.dmsRecipientName}>@{r.username}</Text>
                                <Text style={styles.dmsRecipientMsg} numberOfLines={1}>{r.message}</Text>
                            </View>
                            <Pressable onPress={() => removeDMSRecipient(r.username)} hitSlop={8}>
                                <Ionicons name="close-circle" size={20} color={Colors.error} />
                            </Pressable>
                        </View>
                    ))}

                    {/* Add recipient form */}
                    <View style={styles.dmsAddRow}>
                        <TextInput
                            style={styles.dmsInput}
                            placeholder="@username"
                            placeholderTextColor={Colors.textMuted}
                            value={dmsNewUsername}
                            onChangeText={setDmsNewUsername}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                    <View style={styles.dmsAddRow}>
                        <TextInput
                            style={[styles.dmsInput, { flex: 1 }]}
                            placeholder="Message to deliver…"
                            placeholderTextColor={Colors.textMuted}
                            value={dmsNewMessage}
                            onChangeText={setDmsNewMessage}
                            multiline
                        />
                        <Pressable style={styles.dmsAddBtn} onPress={addDMSRecipient}>
                            <Ionicons name="add" size={20} color={Colors.primary} />
                        </Pressable>
                    </View>

                    {/* Quick-add from contacts */}
                    {contactUsernames.length > 0 && (
                        <View style={styles.dmsContactSuggestions}>
                            <Text style={{ fontSize: 10, color: Colors.textMuted, marginBottom: 4 }}>Contacts:</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {contactUsernames
                                    .filter(u => !dmsRecipients.find(r => r.username === u))
                                    .slice(0, 8)
                                    .map(u => (
                                        <Pressable
                                            key={u}
                                            style={styles.dmsContactChip}
                                            onPress={() => setDmsNewUsername(u)}
                                        >
                                            <Text style={styles.dmsContactChipText}>@{u}</Text>
                                        </Pressable>
                                    ))}
                            </View>
                        </View>
                    )}

                    {/* Action buttons */}
                    <View style={styles.dmsActions}>
                        {!dmsEnabled || !dmsStatus?.enabled ? (
                            <Pressable
                                style={({ pressed }) => [styles.dmsArmBtn, pressed && { opacity: 0.7 }]}
                                onPress={handleDMSSave}
                                disabled={dmsLoading}
                            >
                                {dmsLoading ? (
                                    <ActivityIndicator size="small" color={Colors.background} />
                                ) : (
                                    <>
                                        <Ionicons name="timer-outline" size={16} color={Colors.background} />
                                        <Text style={styles.dmsArmBtnText}>ARM SWITCH</Text>
                                    </>
                                )}
                            </Pressable>
                        ) : (
                            <>
                                <Pressable
                                    style={({ pressed }) => [styles.dmsCheckinBtn, pressed && { opacity: 0.7 }]}
                                    onPress={handleDMSCheckin}
                                    disabled={dmsLoading}
                                >
                                    {dmsLoading ? (
                                        <ActivityIndicator size="small" color={Colors.primary} />
                                    ) : (
                                        <>
                                            <Ionicons name="pulse" size={16} color={Colors.primary} />
                                            <Text style={styles.dmsCheckinBtnText}>CHECK IN NOW</Text>
                                        </>
                                    )}
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.dmsUpdateBtn, pressed && { opacity: 0.7 }]}
                                    onPress={handleDMSSave}
                                    disabled={dmsLoading}
                                >
                                    <Ionicons name="refresh" size={14} color={Colors.primary} />
                                    <Text style={styles.dmsUpdateBtnText}>UPDATE</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.dmsDisableBtn, pressed && { opacity: 0.7 }]}
                                    onPress={handleDMSDisable}
                                    disabled={dmsLoading}
                                >
                                    <Ionicons name="power" size={14} color={Colors.error} />
                                    <Text style={styles.dmsDisableBtnText}>DISARM</Text>
                                </Pressable>
                            </>
                        )}
                    </View>
                </View>

                {/* Danger Zone - More compact, higher up */}
                <View style={styles.dangerZone}>
                    <Text style={styles.dangerTitle}>Emergency Protocol</Text>
                    <Pressable
                        style={({ pressed }) => [
                            styles.burnButton,
                            pressed && styles.burnButtonPressed,
                        ]}
                        onPress={handleBurnIdentity}
                    >
                        <Ionicons name="flame" size={16} color={Colors.error} />
                        <Text style={styles.burnButtonText}>BURN IDENTITY</Text>
                    </Pressable>
                </View>
                </View>
            </ScrollView>
        </View>
    );
}

function SettingsRow({
    icon,
    title,
    subtitle,
    showChevron = true,
    compact = false
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    showChevron?: boolean;
    compact?: boolean;
}) {
    return (
        <View style={[styles.settingsRow, compact && { paddingVertical: 2 }]}>
            <Ionicons name={icon} size={compact ? 18 : 20} color={Colors.primary} />
            <View style={styles.settingsRowContent}>
                <Text style={[styles.settingsRowTitle, compact && { fontSize: 13 }]}>{title}</Text>
                {subtitle && !compact && (
                    <Text style={styles.settingsRowSubtitle}>{subtitle}</Text>
                )}
            </View>
            {showChevron && (
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    backgroundArt: {
        position: 'absolute',
        top: 60,
        right: -10,
        opacity: 0.02,
    },
    watermark: {
        fontSize: 160,
        color: Colors.primary,
    },
    header: {
        paddingTop: Platform.OS === 'ios' ? 54 : 40,
        paddingBottom: 15,
        paddingHorizontal: 24,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerContent: {
        width: '100%',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '300',
        color: Colors.text,
        letterSpacing: 2,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    scrollView: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 100,
    },
    mainContent: {
        flex: 1,
        paddingTop: 16,
        paddingHorizontal: 20,
    },
    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    identityCard: {
        borderColor: 'rgba(201, 169, 98, 0.15)',
        backgroundColor: 'rgba(201, 169, 98, 0.02)',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: Colors.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(201, 169, 98, 0.3)',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '300',
        color: Colors.primary,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    identityInfo: {
        marginLeft: 14,
    },
    username: {
        fontSize: 18,
        fontWeight: '400',
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    networkBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        backgroundColor: 'rgba(52, 211, 153, 0.1)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
    },
    networkDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.accent,
        marginRight: 4,
    },
    networkText: {
        fontSize: 9,
        fontWeight: '700',
        color: Colors.accent,
        letterSpacing: 1,
    },
    publicKeyContainer: {
        marginTop: 14,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    publicKeyLabel: {
        fontSize: 9,
        color: Colors.textMuted,
        marginBottom: 6,
        letterSpacing: 1.5,
        fontWeight: '600',
    },
    keyBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 6,
        padding: 8,
        justifyContent: 'space-between',
    },
    publicKey: {
        flex: 1,
        fontSize: 11,
        color: Colors.textSecondary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        marginRight: 8,
    },
    compactGrid: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 20,
    },
    gridHalf: {
        flex: 1,
    },
    gridFull: {
        flex: 1,
    },
    cardCompact: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    sectionTitle: {
        fontSize: 10,
        color: Colors.primary,
        opacity: 0.8,
        marginBottom: 8,
        marginLeft: 4,
        letterSpacing: 2,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    settingsRowContent: {
        flex: 1,
        marginLeft: 10,
    },
    settingsRowTitle: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.text,
    },
    settingsRowSubtitle: {
        fontSize: 12,
        color: Colors.textMuted,
        marginTop: 1,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        marginVertical: 10,
    },
    dangerZone: {
        marginTop: 10,
        padding: 16,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 107, 107, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255, 107, 107, 0.1)',
    },
    dangerTitle: {
        fontSize: 10,
        color: Colors.error,
        fontWeight: '700',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 12,
        textAlign: 'center',
    },
    burnButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 107, 107, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 107, 107, 0.2)',
        gap: 8,
    },
    burnButtonPressed: {
        backgroundColor: 'rgba(255, 107, 107, 0.15)',
    },
    burnButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.error,
        letterSpacing: 1.5,
    },
    avatarImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    avatarEditBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: Colors.primary,
        borderRadius: 10,
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: Colors.background,
    },
    settingLabel: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: 10,
    },
    colorRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 4,
    },
    colorSwatch: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 0,
        overflow: 'hidden', // Ensures gradients honor the border radius
    },
    colorSwatchSelected: {
        borderWidth: 2,
        borderColor: Colors.primary,
    },
    ephemeralCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    ephemeralCardActive: {
        borderColor: Colors.error,
        backgroundColor: 'rgba(255, 107, 107, 0.08)',
    },
    ephemeralCardPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.98 }],
    },
    ephemeralCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    ephemeralCardText: {
        marginLeft: 14,
        flex: 1,
    },
    ephemeralCardTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text,
    },
    ephemeralCardSubtitle: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: 2,
    },
    ephemeralButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    ephemeralButtonActive: {
        borderColor: Colors.error,
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
    },
    ephemeralButtonPressed: {
        opacity: 0.7,
    },
    ephemeralButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    ephemeralText: {
        marginLeft: 10,
        flex: 1,
    },
    ephemeralSubtitle: {
        fontSize: 10,
        color: Colors.textMuted,
        marginTop: 2,
    },
    // ── Dead Man's Switch styles ──
    dmsStatusBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        borderRadius: 8,
        backgroundColor: 'rgba(52, 211, 153, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.15)',
        marginBottom: 8,
    },
    dmsStatusTriggered: {
        backgroundColor: 'rgba(255, 107, 107, 0.08)',
        borderColor: 'rgba(255, 107, 107, 0.15)',
    },
    dmsStatusText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.accent,
    },
    dmsIntervalRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    dmsIntervalChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    dmsIntervalChipSelected: {
        backgroundColor: 'rgba(201, 169, 98, 0.15)',
        borderColor: Colors.primary,
    },
    dmsIntervalChipText: {
        fontSize: 11,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    dmsIntervalChipTextSelected: {
        color: Colors.primary,
        fontWeight: '700',
    },
    dmsRecipientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        marginBottom: 6,
    },
    dmsRecipientName: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    dmsRecipientMsg: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: 1,
    },
    dmsAddRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    dmsInput: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: Colors.text,
        fontSize: 13,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    dmsAddBtn: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: 'rgba(201, 169, 98, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(201, 169, 98, 0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dmsContactSuggestions: {
        marginTop: 10,
    },
    dmsContactChip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    dmsContactChipText: {
        fontSize: 11,
        color: Colors.textSecondary,
    },
    dmsActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 16,
    },
    dmsArmBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: Colors.primary,
    },
    dmsArmBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.background,
        letterSpacing: 1.2,
    },
    dmsCheckinBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: 'rgba(201, 169, 98, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(201, 169, 98, 0.25)',
    },
    dmsCheckinBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.primary,
        letterSpacing: 1,
    },
    dmsUpdateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    dmsUpdateBtnText: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.primary,
        letterSpacing: 0.5,
    },
    dmsDisableBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 107, 107, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 107, 107, 0.15)',
    },
    dmsDisableBtnText: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.error,
        letterSpacing: 0.5,
    },
});
