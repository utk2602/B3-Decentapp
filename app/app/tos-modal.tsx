import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    Modal,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Colors } from '@/constants/Colors';

export default function TosModalScreen() {
    const router = useRouter();

    return (
        <Modal
            visible={true}
            transparent
            animationType="fade"
            onRequestClose={() => router.back()}
        >
            <Pressable style={styles.backdrop} onPress={() => router.back()}>
                <View style={styles.container}>
                    <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.content}>
                        <ScrollView
                            style={styles.scrollView}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.header}>
                                <Text style={styles.headerTitle}>Terms of Service</Text>
                                <Pressable onPress={() => router.back()} style={styles.closeButton}>
                                    <Text style={styles.closeButtonText}>✕</Text>
                                </Pressable>
                            </View>

                            <Text style={styles.lastUpdated}>LAST UPDATED: JANUARY 2026</Text>

                            <View style={styles.section}>
                                <Text style={styles.title}>1. Zero Tolerance Policy</Text>
                                <Text style={styles.text}>
                                    Key has absolutely no tolerance for objectionable content, abusive behavior, or illegal activities.
                                    This includes but is not limited to:
                                </Text>
                                <View style={styles.list}>
                                    <Text style={styles.listItem}>• Harassment, bullying, threats</Text>
                                    <Text style={styles.listItem}>• Hate speech, discrimination, racism</Text>
                                    <Text style={styles.listItem}>• Sexually explicit content</Text>
                                    <Text style={styles.listItem}>• Spam, scams, fraud</Text>
                                    <Text style={styles.listItem}>• Illegal activities</Text>
                                    <Text style={styles.listItem}>• Doxing or revealing private information</Text>
                                </View>
                                <Text style={styles.warningText}>
                                    Violation of these terms will result in permanent removal from protocol.
                                </Text>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.title}>2. User Responsibilities</Text>
                                <Text style={styles.text}>
                                    As a user of Key, you agree to:
                                </Text>
                                <View style={styles.list}>
                                    <Text style={styles.listItem}>• Only share content you have rights to share</Text>
                                    <Text style={styles.listItem}>• Respect other users' privacy and boundaries</Text>
                                    <Text style={styles.listItem}>• Report objectionable content you encounter</Text>
                                    <Text style={styles.listItem}>• Not attempt to circumvent security measures</Text>
                                    <Text style={styles.listItem}>• Use protocol only for legal, legitimate purposes</Text>
                                </View>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.title}>3. Content Moderation</Text>
                                <Text style={styles.text}>
                                    Key provides tools for users to protect themselves:
                                </Text>
                                <View style={styles.list}>
                                    <Text style={styles.listItem}>• Block any user to prevent them from messaging you</Text>
                                    <Text style={styles.listItem}>• Report objectionable content for review within 24 hours</Text>
                                    <Text style={styles.listItem}>• All messages are end-to-end encrypted</Text>
                                </View>
                                <Text style={styles.warningText}>
                                    Note: Messages are stored on-chain and cannot be deleted.
                                    When a user is blocked, their messages are hidden from your view,
                                    and they can no longer send you new messages.
                                </Text>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.title}>4. Enforcement</Text>
                                <Text style={styles.text}>
                                    We are committed to reviewing all content reports within 24 hours of submission.
                                    Upon verification of violations:
                                </Text>
                                <View style={styles.list}>
                                    <Text style={styles.listItem}>• Offending users will be permanently blocked from protocol</Text>
                                    <Text style={styles.listItem}>• Repeated violations will result in immediate termination</Text>
                                    <Text style={styles.listItem}>• We reserve right to modify or terminate access at any time</Text>
                                </View>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.title}>5. Contact</Text>
                                <Text style={styles.text}>
                                    For questions or to report violations:
                                </Text>
                                <Text style={styles.contactText}>
                                    Email: support@trykey.app
                                </Text>
                            </View>
                        </ScrollView>

                        <Pressable
                            style={styles.acceptButton}
                            onPress={() => router.back()}
                        >
                            <Text style={styles.acceptButtonText}>I Agree</Text>
                        </Pressable>
                    </View>
                </View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: '90%',
        maxWidth: 500,
        maxHeight: '80%',
    },
    content: {
        backgroundColor: Colors.background,
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '600',
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    closeButton: {
        padding: 8,
    },
    closeButtonText: {
        fontSize: 20,
        color: Colors.text,
        fontWeight: '600',
    },
    scrollView: {
        maxHeight: 400,
    },
    lastUpdated: {
        fontSize: 11,
        color: Colors.textMuted,
        marginBottom: 16,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    section: {
        marginBottom: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 8,
        marginTop: 8,
    },
    text: {
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
        marginBottom: 8,
    },
    warningText: {
        fontSize: 14,
        color: Colors.error,
        fontWeight: '500',
        lineHeight: 20,
        marginBottom: 8,
    },
    list: {
        gap: 8,
    },
    listItem: {
        fontSize: 13,
        color: Colors.text,
        lineHeight: 18,
    },
    contactText: {
        fontSize: 14,
        color: Colors.text,
        marginTop: 8,
    },
    acceptButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    acceptButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.background,
    },
});