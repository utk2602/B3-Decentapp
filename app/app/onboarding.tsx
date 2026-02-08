import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { createIdentity, storeUsername } from '@/lib/keychain';
import { uint8ToBase64, uint8ToBase58, getEncryptionPublicKey, signTransaction } from '@/lib/crypto';
import { buildUsernameTransaction, registerUsernameWithTransaction, checkUsernameAvailable } from '@/lib/api';
import { useResponsive } from '@/hooks/useResponsive';

// Digital Renaissance color palette
const GOLD = '#C9A962';
const DEEP_CHARCOAL = '#0A0A0A';
const ICE_BLUE = '#4FC3F7';

export default function OnboardingScreen() {
    const router = useRouter();
    const responsive = useResponsive();
    const [step, setStep] = useState<'landing' | 'username' | 'forging' | 'success'>('landing');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [forgingProgress, setForgingProgress] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [tosAccepted, setTosAccepted] = useState(false);
    
    // Live username availability checking
    const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
    const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);

    // Debounced username availability check
    useEffect(() => {
        const trimmed = username.trim().toLowerCase();

        // Reset if username too short or invalid
        if (trimmed.length < 3 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
            setIsUsernameAvailable(null);
            return;
        }

        // Debounce: wait 500ms before checking
        setIsCheckingAvailability(true);
        const timer = setTimeout(async () => {
            try {
                const available = await checkUsernameAvailable(trimmed);
                setIsUsernameAvailable(available);
                if (!available) {
                    setError('Username already taken');
                } else {
                    setError('');
                }
            } catch {
                // Network error - don't show error, let user try
                setIsUsernameAvailable(null);
            } finally {
                setIsCheckingAvailability(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [username]);

    // Note: Auth routing is handled in _layout.tsx

    // Safe haptics (doesn't throw on web)
    const haptic = async (type: 'light' | 'medium' | 'success' | 'error' | 'warning') => {
        if (Platform.OS === 'web') return;
        try {
            if (type === 'light') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            else if (type === 'medium') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            else if (type === 'success') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            else if (type === 'error') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            else if (type === 'warning') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch { }
    };

    const handleStartChat = () => {
        haptic('medium');
        setStep('username');
    };

    const handleTosPress = () => {
        Linking.openURL('https://trykey.app/tos');
    };

    const handleUsernameSubmit = async () => {
        if (isSubmitting) return;

        const trimmedUsername = username.trim().toLowerCase();

        if (trimmedUsername.length < 3) {
            setError('Username must be at least 3 characters');
            haptic('error');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
            setError('Only letters, numbers, and underscores');
            haptic('error');
            return;
        }

        setIsSubmitting(true);
        setStep('forging');
        startForgingAnimation();

        try {
            // 1. Create keypair locally
            const keypair = await createIdentity();
            // Use base58 for the public key (Solana format)
            const publicKeyBase58 = uint8ToBase58(keypair.publicKey);

            // 2. Derive encryption key for messaging (base64 is fine for this)
            const encryptionPubKey = getEncryptionPublicKey(keypair);
            const encryptionKeyBase64 = uint8ToBase64(encryptionPubKey);

            // 3. Get unsigned transaction from API
            console.log('📦 Building transaction...');
            const { transaction: unsignedTx } = await buildUsernameTransaction(
                trimmedUsername,
                publicKeyBase58,  // Use base58 for Solana
                encryptionKeyBase64 // Pass encryption key
            );

            // 4. Sign transaction with user's keypair
            console.log('✍️ Signing transaction...');
            const signedTx = signTransaction(unsignedTx, keypair.secretKey);

            // 5. Submit signed transaction to register
            console.log('📤 Submitting to blockchain...');
            const result = await registerUsernameWithTransaction(
                trimmedUsername,
                signedTx,
                encryptionKeyBase64
            );

            await storeUsername(trimmedUsername);

            console.log('✅ Identity registered:', trimmedUsername);
            console.log('🔗 Explorer:', result.explorer);

            setStep('success');
            haptic('success');

            // On web, do a full reload to reset auth state
            // On native, navigate normally (auth will be re-checked via focus listener)
            setTimeout(() => {
                if (Platform.OS === 'web') {
                    // Full reload ensures auth state is fresh from localStorage
                    console.log('🔄 Reloading page to refresh auth state...');
                    window.location.href = '/';
                } else {
                    router.replace('/(tabs)');
                }
            }, 1500);
        } catch (err) {
            console.error('Identity creation failed:', err);
            setError(err instanceof Error ? err.message : 'Failed to create identity. Try again.');
            haptic('error');
            setStep('username');
            setIsSubmitting(false);
        }
    };

    const startForgingAnimation = () => {
        // Only do haptic on native
        let hapticInterval: ReturnType<typeof setInterval> | null = null;
        if (Platform.OS !== 'web') {
            hapticInterval = setInterval(() => {
                haptic('light');
            }, 100);
        }

        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 15 + 5;
            if (progress >= 100) {
                progress = 100;
                clearInterval(progressInterval);
                if (hapticInterval) clearInterval(hapticInterval);
            }
            setForgingProgress(progress);
        }, 150);
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior="padding"
            keyboardVerticalOffset={0}
        >
            {/* Subtle mesh gradient background */}
            <View style={styles.meshGradient}>
                <View style={[styles.meshOrb, styles.meshOrb1]} />
                <View style={[styles.meshOrb, styles.meshOrb2]} />
            </View>

            {/* Landing Content */}
            {step === 'landing' && (
                <View style={[styles.content, { maxWidth: responsive.contentMaxWidth }]}>
                    {/* Monochrome key icon */}
                    <View style={styles.keyIconContainer}>
                    <Text style={styles.keyIcon}>⚿</Text>
                </View>

                <Text style={styles.title}>Key</Text>
                <Text style={styles.subtitle}>
                    Private. Ephemeral. Onchain.
                </Text>

                    <Pressable
                        style={({ pressed }) => [
                            styles.button,
                            !tosAccepted && styles.buttonDisabled,
                            pressed && styles.buttonPressed,
                        ]}
                        onPress={handleStartChat}
                        disabled={!tosAccepted}
                    >
                        <Text style={styles.buttonText}>Start Encrypted Chat</Text>
                    </Pressable>

                    <Pressable
                        style={({ pressed }) => [
                            styles.recoverButton,
                            pressed && styles.buttonPressed,
                        ]}
                        onPress={() => router.push('/recovery')}
                    >
                        <Text style={styles.recoverButtonText}>Recover Identity</Text>
                    </Pressable>

                <View style={styles.termsSection}>
                    <Pressable onPress={() => setTosAccepted(!tosAccepted)} style={styles.checkboxContainer}>
                        <View style={[styles.checkbox, tosAccepted && styles.checkboxChecked]}>
                            {tosAccepted && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={styles.termsLinkText}>
                            I agree to{' '}
                            <Text onPress={handleTosPress} style={styles.termsLink}>
                                Terms of Service
                            </Text>
                        </Text>
                    </Pressable>
                </View>
                </View>
            )}

            {/* Username Step - Frosted Glass Modal */}
            {step === 'username' && (
                <View style={[styles.content, { maxWidth: responsive.contentMaxWidth }]}>
                    <BlurView intensity={40} tint="dark" style={[styles.glassModal, { width: responsive.modalMaxWidth }]}>
                        <Text style={styles.formTitle}>Who are you?</Text>

                        <View style={[
                            styles.inputContainer,
                            error ? styles.inputError :
                                isUsernameAvailable === true ? styles.inputValid :
                                    isUsernameAvailable === false ? styles.inputError : null
                        ]}>
                            <Text style={styles.atSymbol}>@</Text>
                            <TextInput
                                style={styles.input}
                                value={username}
                                onChangeText={(text) => {
                                    setUsername(text.replace(/[^a-zA-Z0-9_]/g, ''));
                                    setError('');
                                }}
                                placeholder="username"
                                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                                autoCapitalize="none"
                                autoCorrect={false}
                                maxLength={20}
                                autoFocus
                                onSubmitEditing={handleUsernameSubmit}
                            />
                            {/* Availability indicator */}
                            {isCheckingAvailability && (
                                <ActivityIndicator size="small" color={GOLD} style={styles.availabilityIndicator} />
                            )}
                            {!isCheckingAvailability && isUsernameAvailable === true && (
                                <Text style={[styles.availabilityIndicator, { color: '#4CAF50' }]}>✓</Text>
                            )}
                            {!isCheckingAvailability && isUsernameAvailable === false && (
                                <Text style={[styles.availabilityIndicator, { color: '#FF5252' }]}>✗</Text>
                            )}
                        </View>

                        {error && <Text style={styles.error}>{error}</Text>}
                        {!error && isUsernameAvailable === true && username.length >= 3 && (
                            <Text style={[styles.availabilityText, { color: '#4CAF50' }]}>
                                Username available onchain!
                            </Text>
                        )}

                        <Pressable
                            style={({ pressed }) => [
                                styles.button,
                                (!username.trim() || isUsernameAvailable === false || isCheckingAvailability) && styles.buttonDisabled,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={handleUsernameSubmit}
                            disabled={!username.trim() || isUsernameAvailable === false || isCheckingAvailability}
                        >
                            <Text style={styles.buttonText}>Claim Identity</Text>
                        </Pressable>
                    </BlurView>
                </View>
            )}

            {/* Forging Step */}
            {step === 'forging' && (
                <View style={[styles.content, { maxWidth: responsive.contentMaxWidth }]}>
                    <BlurView intensity={40} tint="dark" style={[styles.glassModal, { width: responsive.modalMaxWidth }]}>
                        <Text style={styles.forgingTitle}>Forging 256-bit keys...</Text>
                        <Text style={styles.forgingSubtitle}>Creating your identity</Text>

                        <View style={[styles.progressContainer, { width: Math.min(responsive.modalMaxWidth - 60, 300) }]}>
                            <View style={[styles.progressBar, { width: `${forgingProgress}%` }]} />
                        </View>

                        <Text style={styles.progressText}>{Math.round(forgingProgress)}%</Text>
                    </BlurView>
                </View>
            )}

            {/* Success Step */}
            {step === 'success' && (
                <View style={[styles.content, { maxWidth: responsive.contentMaxWidth }]}>
                    <BlurView intensity={40} tint="dark" style={[styles.glassModal, { width: responsive.modalMaxWidth }]}>
                        <Text style={styles.successIcon}>✓</Text>
                        <Text style={styles.successText}>Identity Created</Text>
                    </BlurView>
                </View>
            )}

            {/* Footer */}
            <Text style={styles.footer}>Powered by Solana</Text>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DEEP_CHARCOAL,
        justifyContent: 'center',
        alignItems: 'center',
    },
    meshGradient: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
    },
    meshOrb: {
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: 200,
        opacity: 0.08,
    },
    meshOrb1: {
        top: -150,
        left: -150,
        backgroundColor: GOLD,
    },
    meshOrb2: {
        bottom: -150,
        right: -150,
        backgroundColor: ICE_BLUE,
    },
    keyIconContainer: {
        marginBottom: 24,
        alignItems: 'center',
    },
    keyIcon: {
        fontSize: 80,
        color: GOLD,
        opacity: 0.9,
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 24,
        width: '100%',
    },
    title: {
        fontSize: 52,
        fontWeight: '300',
        color: '#FAFAFA',
        marginBottom: 8,
        letterSpacing: 4,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        marginBottom: 48,
        letterSpacing: 2,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    button: {
        backgroundColor: GOLD,
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 8,
        shadowColor: GOLD,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    recoverButton: {
        marginTop: 16,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    recoverButtonText: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    buttonPressed: {
        transform: [{ scale: 0.98 }],
        shadowOpacity: 0.15,
    },
    buttonDisabled: {
        opacity: 0.4,
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: DEEP_CHARCOAL,
        textAlign: 'center',
        letterSpacing: 1,
    },
    glassModal: {
        borderRadius: 24,
        padding: 32,
        maxWidth: 500,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
    },
    formTitle: {
        fontSize: 24,
        fontWeight: '300',
        color: '#FAFAFA',
        marginBottom: 24,
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        paddingHorizontal: 20,
        paddingVertical: 16,
        marginBottom: 16,
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    inputValid: {
        borderColor: GOLD,
    },
    inputError: {
        borderColor: '#FF6B6B',
    },
    atSymbol: {
        fontSize: 20,
        color: GOLD,
        marginRight: 8,
        fontWeight: '500',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    input: {
        flex: 1,
        fontSize: 20,
        color: '#FAFAFA',
        fontWeight: '400',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    error: {
        color: '#FF6B6B',
        fontSize: 13,
        marginBottom: 16,
        alignSelf: 'flex-start',
    },
    forgingTitle: {
        fontSize: 22,
        fontWeight: '300',
        color: '#FAFAFA',
        textAlign: 'center',
        marginBottom: 8,
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    forgingSubtitle: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        marginBottom: 32,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    progressContainer: {
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: GOLD,
        borderRadius: 2,
    },
    progressText: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        marginTop: 12,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    successIcon: {
        fontSize: 60,
        color: GOLD,
    },
    successText: {
        fontSize: 22,
        fontWeight: '300',
        color: '#FAFAFA',
        marginTop: 16,
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    footer: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: 11,
        letterSpacing: 2,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    availabilityIndicator: {
        position: 'absolute',
        right: 16,
        top: 20,
        backgroundColor: 'transparent',
    },
    availabilityText: {
        fontSize: 11,
        letterSpacing: 2,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    termsSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 32,
        marginBottom: 16,
        gap: 8,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    checkboxChecked: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    checkmark: {
        color: Colors.background,
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 18,
    },
    termsLink: {
        textDecorationLine: 'underline',
        opacity: 0.8,
    },
    termsLinkText: {
        fontSize: 13,
        color: '#FAFAFA',
    },
});
