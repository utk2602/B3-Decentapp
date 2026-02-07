import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { MediaStream } from 'react-native-webrtc';
import { RTCView } from 'react-native-webrtc';
import { CallState, endCall, toggleMute, toggleCamera } from '@/lib/webrtc';
import { Colors } from '@/constants/Colors';

interface CallScreenProps {
    peerUsername: string;
    callState: CallState;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isVideo: boolean;
    onEndCall: () => void;
}

export function CallScreen({
    peerUsername,
    callState,
    localStream,
    remoteStream,
    isVideo,
    onEndCall,
}: CallScreenProps) {
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (callState === 'connected') {
            interval = setInterval(() => {
                setDuration((d) => d + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [callState]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleMute = () => {
        const enabled = toggleMute();
        setIsMuted(!enabled);
    };

    const handleCamera = () => {
        const enabled = toggleCamera();
        setIsCameraOff(!enabled);
    };

    const handleEndCall = () => {
        endCall();
        onEndCall();
    };

    return (
        <View style={styles.container}>
            {/* Remote Video */}
            {isVideo && remoteStream && (
                <RTCView
                    streamURL={remoteStream.toURL()}
                    style={styles.remoteVideo}
                    objectFit="cover"
                />
            )}

            {/* Avatar for audio call or no remote video */}
            {(!isVideo || !remoteStream) && (
                <View style={styles.avatarContainer}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {peerUsername.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                    <Text style={styles.peerName}>@{peerUsername}</Text>
                </View>
            )}

            {/* Call Status */}
            <View style={styles.statusContainer}>
                <Text style={styles.statusText}>
                    {callState === 'calling' && 'Calling...'}
                    {callState === 'ringing' && 'Ringing...'}
                    {callState === 'connected' && formatDuration(duration)}
                    {callState === 'ended' && 'Call Ended'}
                </Text>
            </View>

            {/* Local Video (PiP) */}
            {isVideo && localStream && (
                <View style={styles.localVideoContainer}>
                    <RTCView
                        streamURL={localStream.toURL()}
                        style={styles.localVideo}
                        objectFit="cover"
                        mirror
                    />
                </View>
            )}

            {/* Controls */}
            <View style={styles.controls}>
                {isVideo && (
                    <TouchableOpacity
                        style={[styles.controlButton, isCameraOff && styles.controlButtonActive]}
                        onPress={handleCamera}
                    >
                        <FontAwesome
                            name={isCameraOff ? 'video-camera' : 'video-camera'}
                            size={24}
                            color={isCameraOff ? Colors.primary : '#fff'}
                        />
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={[styles.controlButton, isMuted && styles.controlButtonActive]}
                    onPress={handleMute}
                >
                    <FontAwesome
                        name={isMuted ? 'microphone-slash' : 'microphone'}
                        size={24}
                        color={isMuted ? Colors.primary : '#fff'}
                    />
                </TouchableOpacity>

                <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall}>
                    <FontAwesome name="phone" size={28} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
    },
    remoteVideo: {
        flex: 1,
    },
    avatarContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatarText: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#000',
    },
    peerName: {
        fontSize: 24,
        fontWeight: '600',
        color: '#fff',
    },
    statusContainer: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    statusText: {
        fontSize: 16,
        color: '#fff',
        opacity: 0.8,
    },
    localVideoContainer: {
        position: 'absolute',
        top: 100,
        right: 16,
        width: 100,
        height: 150,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: Colors.primary,
    },
    localVideo: {
        flex: 1,
    },
    controls: {
        position: 'absolute',
        bottom: 50,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
    },
    controlButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    controlButtonActive: {
        backgroundColor: '#fff',
    },
    endCallButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FF3B30',
        justifyContent: 'center',
        alignItems: 'center',
        transform: [{ rotate: '135deg' }],
    },
});

export default CallScreen;
