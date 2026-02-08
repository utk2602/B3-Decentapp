import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    TextInput,
    ActivityIndicator,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { getPublicKeyByUsername } from '@/lib/api';
import { storeKeypair, storeUsername } from '@/lib/keychain';
import {
    initiateRecovery,
    checkRecoveryStatus,
    completeRecovery,
    type RecoverySession,
} from '@/lib/recovery';
import { useResponsive } from '@/hooks/useResponsive';

const GOLD = '#C9A962';
const DEEP_CHARCOAL = '#0A0A0A';

export default function RecoveryScreen() {
    const router = useRouter();
    const responsive = useResponsive();

    const [step, setStep] = useState<'username' | 'waiting' | 'success' | 'error'>('username');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [session, setSession] = useState<RecoverySession | null>(null);
    const [submittedCount, setSubmittedCount] = useState(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Haptics helper
    const haptic = async (type: 'light' | 'medium' | 'success' | 'error') => {
        if (Platform.OS === 'web') return;
        try {
            if (type === 'success')
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            else if (type === 'error')
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            else if (type === 'medium')
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            else
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}
    };

    // Clean up polling on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    // ── Step 1: Enter username and initiate ──

    const handleSubmitUsername = async () => {
        const trimmed = username.trim().toLowerCase();
        if (trimmed.length < 3) {
            setError('Username must be at least 3 characters');
            haptic('error');
            return;
        }

        setError('');
        setStep('waiting');
        haptic('medium');

        try {
            // Look up the owner's signing pubkey from username
            const userData = await getPublicKeyByUsername(trimmed);
            if (!userData) {
                setError('Username not found. Verify spelling and try again.');
                setStep('username');
                haptic('error');
                return;
            }

            const { session: sess, error: initError } = await initiateRecovery(
                userData.publicKey,
            );

            if (initError || !sess) {
                setError(initError || 'Could not start recovery session');
                setStep('username');
                haptic('error');
                return;
            }

            setSession(sess);
            startPolling(sess);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Recovery initiation failed',
            );
            setStep('username');
            haptic('error');
        }
    };

    // ── Step 2: Poll for guardian approvals ──

    const startPolling = (sess: RecoverySession) => {
        if (pollRef.current) clearInterval(pollRef.current);

        pollRef.current = setInterval(async () => {
            const status = await checkRecoveryStatus(sess.recoveryId);
            if (!status) return;

            setSubmittedCount(status.submittedCount);

            if (status.ready) {
                if (pollRef.current) clearInterval(pollRef.current);
                handleRecover(sess);
            }
        }, 4000); // Poll every 4 seconds
    };

    // ── Step 3: Reconstruct identity ──

    const handleRecover = async (sess: RecoverySession) => {
        try {
            const { keypair, error: recErr } = await completeRecovery(
                sess.recoveryId,
                sess.tempKeypair.secretKey,
            );

            if (recErr || !keypair) {
                setError(recErr || 'Failed to reconstruct identity');
                setStep('error');
                haptic('error');
                return;
            }

            // Store recovered keypair
            await storeKeypair(keypair);
            await storeUsername(username.trim().toLowerCase());

            setStep('success');
            haptic('success');

            setTimeout(() => {
                if (Platform.OS === 'web') {
                    window.location.href = '/';
                } else {
                    router.replace('/(tabs)');
                }
            }, 1500);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Recovery failed',
            );
            setStep('error');
            haptic('error');
        }
    };

    // ── Render ──

    return (
        <KeyboardAvoidingView style={styles.container} behavior="padding">
            {/* Background */}
            <View style={styles.meshGradient}>
                <View style={[styles.meshOrb, styles.meshOrb1]} />
                <View style={[styles.meshOrb, styles.meshOrb2]} />
            </View>

            {/* ── Username entry ── */}
            {step === 'username' && (
                <View style={[styles.content, { maxWidth: responsive.contentMaxWidth }]}>
                    <BlurView
                        intensity={40}
                        tint="dark"
                        style={[styles.glassModal, { width: responsive.modalMaxWidth }]}
                    >
                        <Text style={styles.icon}>🔑</Text>
                        <Text style={styles.title}>Recover Identity</Text>
                        <Text style={styles.subtitle}>
                            Enter your username. Your guardians will be asked to approve
                            the recovery.
                        </Text>

                        <View style={[styles.inputContainer, error ? styles.inputError : null]}>
                            <Text style={styles.atSymbol}>@</Text>
                            <TextInput
                                style={styles.input}
                                value={username}
                                onChangeText={(t) => {
                                    setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''));
                                    setError('');
                                }}
                                placeholder="username"
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                autoCapitalize="none"
                                autoCorrect={false}
                                maxLength={20}
                                autoFocus
                                onSubmitEditing={handleSubmitUsername}
                            />
                        </View>

                        {error ? <Text style={styles.error}>{error}</Text> : null}

                        <Pressable
                            style={({ pressed }) => [
                                styles.button,
                                !username.trim() && styles.buttonDisabled,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={handleSubmitUsername}
                            disabled={!username.trim()}
                        >
                            <Text style={styles.buttonText}>Begin Recovery</Text>
                        </Pressable>

                        <Pressable
                            onPress={() => router.back()}
                            style={{ marginTop: 16 }}
                        >
                            <Text style={styles.linkText}>← Back to sign-in</Text>
                        </Pressable>
                    </BlurView>
                </View>
            )}

            {/* ── Waiting for guardians ── */}
            {step === 'waiting' && (
                <View style={[styles.content, { maxWidth: responsive.contentMaxWidth }]}>
                    <BlurView
                        intensity={40}
                        tint="dark"
                        style={[styles.glassModal, { width: responsive.modalMaxWidth }]}
                    >
                        <ActivityIndicator size="large" color={GOLD} />
                        <Text style={[styles.title, { marginTop: 24 }]}>
                            Waiting for Guardians
                        </Text>
                        <Text style={styles.subtitle}>
                            Ask your guardians to open their Key app and approve the
                            recovery request from Settings → Recovery Requests.
                        </Text>

                        {session && (
                            <View style={styles.progressBox}>
                                <Text style={styles.progressText}>
                                    {submittedCount} / {session.threshold} approvals
                                </Text>
                                <View style={styles.progressTrack}>
                                    <View
                                        style={[
                                            styles.progressFill,
                                            {
                                                width: `${Math.min(
                                                    (submittedCount / session.threshold) * 100,
                                                    100,
                                                )}%`,
                                            },
                                        ]}
                                    />
                                </View>
                            </View>
                        )}

                        <Pressable
                            onPress={() => {
                                if (pollRef.current) clearInterval(pollRef.current);
                                setStep('username');
                            }}
                            style={{ marginTop: 24 }}
                        >
                            <Text style={styles.linkText}>Cancel</Text>
                        </Pressable>
                    </BlurView>
                </View>
            )}

            {/* ── Success ── */}
            {step === 'success' && (
                <View style={[styles.content, { maxWidth: responsive.contentMaxWidth }]}>
                    <BlurView
                        intensity={40}
                        tint="dark"
                        style={[styles.glassModal, { width: responsive.modalMaxWidth }]}
                    >
                        <Text style={styles.successIcon}>✓</Text>
                        <Text style={styles.title}>Identity Recovered</Text>
                        <Text style={styles.subtitle}>
                            Your keys have been reconstructed and stored securely.
                        </Text>
                    </BlurView>
                </View>
            )}

            {/* ── Error ── */}
            {step === 'error' && (
                <View style={[styles.content, { maxWidth: responsive.contentMaxWidth }]}>
                    <BlurView
                        intensity={40}
                        tint="dark"
                        style={[styles.glassModal, { width: responsive.modalMaxWidth }]}
                    >
                        <Text style={styles.errorIcon}>✗</Text>
                        <Text style={styles.title}>Recovery Failed</Text>
                        <Text style={[styles.subtitle, { color: '#FF6B6B' }]}>
                            {error}
                        </Text>
                        <Pressable
                            style={({ pressed }) => [
                                styles.button,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={() => {
                                setError('');
                                setStep('username');
                            }}
                        >
                            <Text style={styles.buttonText}>Try Again</Text>
                        </Pressable>
                    </BlurView>
                </View>
            )}

            <Text style={styles.footer}>Shamir's Secret Sharing · GF(256)</Text>
        </KeyboardAvoidingView>
    );
}

// ── Styles ──

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
        backgroundColor: '#4FC3F7',
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 24,
        width: '100%',
    },
    glassModal: {
        borderRadius: 24,
        padding: 32,
        maxWidth: 500,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    icon: { fontSize: 48, marginBottom: 12 },
    title: {
        fontSize: 24,
        fontWeight: '300',
        color: '#FAFAFA',
        marginBottom: 8,
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        paddingHorizontal: 20,
        paddingVertical: 16,
        marginBottom: 16,
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    inputError: { borderColor: '#FF6B6B' },
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
    buttonPressed: { transform: [{ scale: 0.98 }], shadowOpacity: 0.15 },
    buttonDisabled: { opacity: 0.4 },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: DEEP_CHARCOAL,
        textAlign: 'center',
        letterSpacing: 1,
    },
    linkText: {
        color: GOLD,
        fontSize: 14,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    progressBox: {
        width: '100%',
        marginTop: 24,
        alignItems: 'center',
    },
    progressText: {
        color: GOLD,
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    progressTrack: {
        width: '100%',
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: GOLD,
        borderRadius: 3,
    },
    successIcon: {
        fontSize: 48,
        color: '#4CAF50',
        marginBottom: 12,
    },
    errorIcon: {
        fontSize: 48,
        color: '#FF6B6B',
        marginBottom: 12,
    },
    footer: {
        position: 'absolute',
        bottom: 40,
        fontSize: 11,
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
});
