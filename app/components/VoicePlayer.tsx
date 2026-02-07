import React, { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { formatDuration } from '@/lib/voice';
import { Colors } from '@/constants/Colors';

interface VoicePlayerProps {
    uri: string;
    duration: number;
}

export function VoicePlayer({ uri, duration }: VoicePlayerProps) {
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);

    useEffect(() => {
        return () => {
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, [sound]);

    const handlePlayPause = useCallback(async () => {
        try {
            if (isPlaying && sound) {
                await sound.pauseAsync();
                setIsPlaying(false);
                return;
            }

            if (sound) {
                await sound.playAsync();
                setIsPlaying(true);
                return;
            }

            // Load and play
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
            });

            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri },
                { shouldPlay: true },
                (status) => {
                    if (status.isLoaded) {
                        setPosition(status.positionMillis || 0);
                        if (status.didJustFinish) {
                            setIsPlaying(false);
                            setPosition(0);
                        }
                    }
                }
            );

            setSound(newSound);
            setIsPlaying(true);
        } catch (error) {
            console.error('Failed to play audio:', error);
        }
    }, [sound, isPlaying, uri]);

    const progress = duration > 0 ? position / duration : 0;

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={handlePlayPause} style={styles.playButton}>
                <FontAwesome
                    name={isPlaying ? 'pause' : 'play'}
                    size={16}
                    color={Colors.primary}
                />
            </TouchableOpacity>

            <View style={styles.waveformContainer}>
                {/* Simple waveform visualization */}
                {Array.from({ length: 20 }).map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.waveformBar,
                            {
                                height: 8 + Math.random() * 16,
                                backgroundColor: i / 20 <= progress ? Colors.primary : Colors.border,
                            },
                        ]}
                    />
                ))}
            </View>

            <Text style={styles.duration}>
                {formatDuration(isPlaying ? position : duration)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 12,
        gap: 12,
        minWidth: 200,
    },
    playButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    waveformContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: 32,
        gap: 2,
    },
    waveformBar: {
        width: 3,
        borderRadius: 2,
    },
    duration: {
        color: Colors.textSecondary,
        fontSize: 12,
        minWidth: 40,
    },
});

export default VoicePlayer;
