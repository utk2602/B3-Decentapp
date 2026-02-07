import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface VoiceRecording {
    uri: string;
    duration: number;
    mimeType: string;
}

let recording: Audio.Recording | null = null;

/**
 * Request microphone permissions
 */
export async function requestMicrophonePermission(): Promise<boolean> {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
}

/**
 * Start recording audio
 */
export async function startRecording(): Promise<void> {
    try {
        // Request permission if needed
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
            throw new Error('Microphone permission denied');
        }

        // Configure audio mode for recording
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
        });

        // Create and start recording
        const { recording: newRecording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
        );

        recording = newRecording;
        console.log('🎙️ Recording started');
    } catch (error) {
        console.error('Failed to start recording:', error);
        throw error;
    }
}

/**
 * Stop recording and return the recorded audio
 */
export async function stopRecording(): Promise<VoiceRecording | null> {
    if (!recording) {
        return null;
    }

    try {
        await recording.stopAndUnloadAsync();

        // Reset audio mode
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
        });

        const uri = recording.getURI();
        const status = await recording.getStatusAsync();

        recording = null;

        if (!uri) {
            return null;
        }

        console.log('🎙️ Recording stopped:', uri);

        return {
            uri,
            duration: status.durationMillis || 0,
            mimeType: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4',
        };
    } catch (error) {
        console.error('Failed to stop recording:', error);
        recording = null;
        throw error;
    }
}

/**
 * Cancel recording without saving
 */
export async function cancelRecording(): Promise<void> {
    if (recording) {
        try {
            await recording.stopAndUnloadAsync();
        } catch {
            // Ignore errors during cancel
        }
        recording = null;
    }
}

/**
 * Read audio file as base64
 */
export async function getAudioBase64(uri: string): Promise<string> {
    const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
    });
    return base64;
}

/**
 * Play audio from a URI
 */
export async function playAudio(uri: string): Promise<Audio.Sound> {
    await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
    });

    const { sound } = await Audio.Sound.createAsync({ uri });
    await sound.playAsync();
    return sound;
}

/**
 * Play audio from base64 data
 */
export async function playAudioFromBase64(
    base64: string,
    mimeType: string = 'audio/m4a'
): Promise<Audio.Sound> {
    const uri = `data:${mimeType};base64,${base64}`;
    return playAudio(uri);
}

/**
 * Format duration in mm:ss
 */
export function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
