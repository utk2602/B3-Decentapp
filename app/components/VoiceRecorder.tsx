import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { startRecording, stopRecording, cancelRecording, formatDuration, type VoiceRecording } from '@/lib/voice';
import { Colors } from '@/constants/Colors';

interface VoiceRecorderProps {
    onRecordingComplete: (recording: VoiceRecording) => void;
    onCancel?: () => void;
}

export function VoiceRecorder({ onRecordingComplete, onCancel }: VoiceRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [pulseAnim] = useState(new Animated.Value(1));

    const startPulse = useCallback(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.2,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [pulseAnim]);

    const handlePressIn = useCallback(async () => {
        try {
            await startRecording();
            setIsRecording(true);
            setDuration(0);
            startPulse();

            // Update duration every 100ms
            const interval = setInterval(() => {
                setDuration((d) => d + 100);
            }, 100);

            // Store interval ID for cleanup
            (handlePressIn as any).interval = interval;
        } catch (error) {
            console.error('Failed to start recording:', error);
        }
    }, [startPulse]);

    const handlePressOut = useCallback(async () => {
        // Clear interval
        if ((handlePressIn as any).interval) {
            clearInterval((handlePressIn as any).interval);
        }

        if (!isRecording) return;

        setIsRecording(false);
        pulseAnim.stopAnimation();
        pulseAnim.setValue(1);

        try {
            const recording = await stopRecording();
            if (recording && recording.duration >= 500) {
                onRecordingComplete(recording);
            } else {
                // Too short, treat as cancel
                onCancel?.();
            }
        } catch (error) {
            console.error('Failed to stop recording:', error);
            onCancel?.();
        }
    }, [isRecording, onRecordingComplete, onCancel, pulseAnim]);

    const handleCancel = useCallback(async () => {
        if ((handlePressIn as any).interval) {
            clearInterval((handlePressIn as any).interval);
        }
        setIsRecording(false);
        pulseAnim.stopAnimation();
        pulseAnim.setValue(1);
        await cancelRecording();
        onCancel?.();
    }, [onCancel, pulseAnim]);

    return (
        <View style={styles.container}>
            {isRecording && (
                <View style={styles.recordingInfo}>
                    <View style={styles.redDot} />
                    <Text style={styles.duration}>{formatDuration(duration)}</Text>
                    <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
                        <FontAwesome name="times" size={20} color={Colors.text} />
                    </TouchableOpacity>
                </View>
            )}

            <Animated.View style={[styles.buttonWrapper, { transform: [{ scale: pulseAnim }] }]}>
                <TouchableOpacity
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    style={[styles.button, isRecording && styles.buttonRecording]}
                    activeOpacity={0.8}
                >
                    <FontAwesome
                        name="microphone"
                        size={24}
                        color={isRecording ? '#fff' : Colors.primary}
                    />
                </TouchableOpacity>
            </Animated.View>

            {!isRecording && (
                <Text style={styles.hint}>Hold to record</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        padding: 16,
    },
    recordingInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    redDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#FF3B30',
    },
    duration: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: '600',
        minWidth: 50,
    },
    cancelButton: {
        padding: 8,
        marginLeft: 8,
    },
    buttonWrapper: {
        borderRadius: 40,
    },
    button: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: Colors.primary,
    },
    buttonRecording: {
        backgroundColor: '#FF3B30',
        borderColor: '#FF3B30',
    },
    hint: {
        color: Colors.textSecondary,
        fontSize: 12,
        marginTop: 8,
    },
});

export default VoiceRecorder;
