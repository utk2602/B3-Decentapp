import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Modal,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { submitReport } from '@/lib/api';
import { getStoredKeypair } from '@/lib/keychain';
import { uint8ToBase58 } from '@/lib/crypto';
import { Platform } from 'react-native';

interface ReportModalProps {
    visible: boolean;
    onClose: () => void;
    messageSignature: string;
    reportedPubkey: string;
}

export function ReportModal({ visible, onClose, messageSignature, reportedPubkey }: ReportModalProps) {
    const [selectedReason, setSelectedReason] = React.useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const reportReasons = [
        { id: 'harassment', label: 'Harassment', icon: 'warning-outline' },
        { id: 'spam', label: 'Spam', icon: 'mail-unread-outline' },
        { id: 'inappropriate', label: 'Inappropriate Content', icon: 'eye-off-outline' },
        { id: 'illegal', label: 'Illegal Activity', icon: 'alert-circle-outline' },
        { id: 'scam', label: 'Scam', icon: 'cash-outline' },
        { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle' },
    ];

    const handleSubmit = async () => {
        if (!selectedReason) return;

        setIsSubmitting(true);
        try {
            const keypair = await getStoredKeypair();
            if (!keypair) {
                throw new Error('No identity found');
            }

            const reporterPubkey = uint8ToBase58(keypair.publicKey);
            const result = await submitReport(
                reporterPubkey,
                reportedPubkey,
                messageSignature,
                selectedReason
            );

            if (Platform.OS !== 'web') {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }

            alert(`✅ ${result.message}`);
            onClose();
            setSelectedReason(null);
        } catch (error) {
            console.error('Report failed:', error);
            if (Platform.OS !== 'web') {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
            alert('Failed to submit report. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose}>
                <View style={styles.container}>
                    <View style={styles.content}>
                        {/* Header */}
                        <View style={styles.header}>
                            <Ionicons name="flag-outline" size={28} color={Colors.error} />
                            <Text style={styles.title}>Report Content</Text>
                            <Pressable onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={Colors.text} />
                            </Pressable>
                        </View>

                        {/* Warning */}
                        <View style={styles.warningBox}>
                            <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
                            <Text style={styles.warningText}>
                                Messages are stored on-chain and cannot be deleted. 
                                However, reported users will be reviewed and may be permanently blocked.
                            </Text>
                        </View>

                        {/* Reason Selection */}
                        <Text style={styles.sectionTitle}>Reason for Report</Text>
                        <ScrollView style={styles.reasonsList}>
                            {reportReasons.map((reason) => (
                                <Pressable
                                    key={reason.id}
                                    style={[
                                        styles.reasonItem,
                                        selectedReason === reason.id && styles.reasonItemSelected
                                    ]}
                                    onPress={() => {
                                        if (Platform.OS !== 'web') {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }
                                        setSelectedReason(reason.id);
                                    }}
                                >
                                    <Ionicons 
                                        name={reason.icon} 
                                        size={22} 
                                        color={selectedReason === reason.id ? Colors.primary : Colors.textMuted} 
                                    />
                                    <Text style={[
                                        styles.reasonLabel,
                                        selectedReason === reason.id && styles.reasonLabelSelected
                                    ]}>
                                        {reason.label}
                                    </Text>
                                    {selectedReason === reason.id && (
                                        <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                                    )}
                                </Pressable>
                            ))}
                        </ScrollView>

                        {/* Submit Button */}
                        <Pressable
                            style={[
                                styles.submitButton,
                                !selectedReason && styles.submitButtonDisabled,
                                isSubmitting && styles.submitButtonSubmitting
                            ]}
                            onPress={handleSubmit}
                            disabled={!selectedReason || isSubmitting}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color={Colors.background} />
                            ) : (
                                <>
                                    <Ionicons name="paper-plane" size={18} color={Colors.background} />
                                    <Text style={styles.submitButtonText}>Submit Report</Text>
                                </>
                            )}
                        </Pressable>

                        {/* Cancel */}
                        <Pressable style={styles.cancelButton} onPress={onClose}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
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
        maxWidth: 450,
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
        alignItems: 'center',
        marginBottom: 20,
        gap: 12,
    },
    title: {
        flex: 1,
        fontSize: 22,
        fontWeight: '600',
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    closeButton: {
        padding: 8,
    },
    warningBox: {
        backgroundColor: 'rgba(201, 169, 98, 0.1)',
        borderLeftWidth: 3,
        borderLeftColor: Colors.primary,
        padding: 12,
        marginBottom: 20,
        flexDirection: 'row',
        gap: 12,
    },
    warningText: {
        flex: 1,
        fontSize: 13,
        color: Colors.text,
        lineHeight: 18,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    reasonsList: {
        maxHeight: 300,
    },
    reasonItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    reasonItemSelected: {
        backgroundColor: 'rgba(201, 169, 98, 0.15)',
        borderColor: Colors.primary,
    },
    reasonLabel: {
        flex: 1,
        fontSize: 15,
        color: Colors.text,
        marginLeft: 12,
    },
    reasonLabelSelected: {
        color: Colors.primary,
        fontWeight: '600',
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.primary,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
        marginTop: 8,
    },
    submitButtonDisabled: {
        backgroundColor: Colors.textMuted,
        opacity: 0.5,
    },
    submitButtonSubmitting: {
        opacity: 0.7,
    },
    submitButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.background,
    },
    cancelButton: {
        alignItems: 'center',
        paddingVertical: 12,
        marginTop: 8,
    },
    cancelButtonText: {
        fontSize: 14,
        color: Colors.textMuted,
    },
});