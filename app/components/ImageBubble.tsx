import React, { useState } from 'react';
import {
    View,
    Image,
    StyleSheet,
    Pressable,
    Modal,
    useWindowDimensions,
    ActivityIndicator,
    Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { type Message } from '@/lib/storage';
import * as Haptics from 'expo-haptics';

interface ImageBubbleProps {
    message: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
}

export function ImageBubble({ message, isFirstInGroup, isLastInGroup }: ImageBubbleProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const maxBubbleWidth = Math.min(screenWidth * 0.65, 300);
    const maxBubbleHeight = 300;

    const isMine = message.isMine;

    // Calculate aspect ratio for proper sizing
    const aspectRatio = message.width && message.height
        ? message.width / message.height
        : 1;

    // Calculate display dimensions
    let displayWidth = maxBubbleWidth;
    let displayHeight = displayWidth / aspectRatio;

    if (displayHeight > maxBubbleHeight) {
        displayHeight = maxBubbleHeight;
        displayWidth = displayHeight * aspectRatio;
    }

    const imageUri = `data:${message.mimeType || 'image/jpeg'};base64,${message.content}`;

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsFullscreen(true);
    };

    const handleClose = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsFullscreen(false);
    };

    // Status indicator
    const renderStatus = () => {
        if (!isMine) return null;

        let icon: 'time-outline' | 'checkmark' | 'checkmark-done' | 'alert-circle' = 'time-outline';
        let color = Colors.textMuted;

        switch (message.status) {
            case 'sending':
                icon = 'time-outline';
                break;
            case 'sent':
                icon = 'checkmark';
                color = Colors.textSecondary;
                break;
            case 'confirmed':
                icon = 'checkmark-done';
                color = Colors.primary;
                break;
            case 'failed':
                icon = 'alert-circle';
                color = Colors.error;
                break;
        }

        return <Ionicons name={icon} size={12} color={color} style={styles.statusIcon} />;
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    return (
        <>
            <View
                style={[
                    styles.container,
                    isMine ? styles.containerMine : styles.containerTheirs,
                    isFirstInGroup && styles.firstInGroup,
                    isLastInGroup && styles.lastInGroup,
                ]}
            >
                <Pressable
                    onPress={handlePress}
                    style={[
                        styles.imageBubble,
                        isMine ? styles.bubbleMine : styles.bubbleTheirs,
                        { width: displayWidth, height: displayHeight },
                    ]}
                >
                    {isLoading && (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator color={Colors.primary} />
                        </View>
                    )}
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.image}
                        resizeMode="cover"
                        onLoadEnd={() => setIsLoading(false)}
                    />

                    {/* Timestamp overlay */}
                    <View style={styles.timestampOverlay}>
                        <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
                        {renderStatus()}
                    </View>
                </Pressable>
            </View>

            {/* Fullscreen modal */}
            <Modal
                visible={isFullscreen}
                transparent
                animationType="fade"
                onRequestClose={handleClose}
            >
                <View style={styles.modalContainer}>
                    <Pressable style={styles.closeButton} onPress={handleClose}>
                        <Ionicons name="close" size={28} color="#fff" />
                    </Pressable>

                    <Image
                        source={{ uri: imageUri }}
                        style={{ width: screenWidth, height: screenHeight * 0.8 }}
                        resizeMode="contain"
                    />
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        marginVertical: 2,
        marginHorizontal: 16,
    },
    containerMine: {
        alignItems: 'flex-end',
    },
    containerTheirs: {
        alignItems: 'flex-start',
    },
    firstInGroup: {
        marginTop: 4,
    },
    lastInGroup: {
        marginBottom: 4,
    },
    imageBubble: {
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: Colors.surface,
    },
    bubbleMine: {
        borderBottomRightRadius: 4,
    },
    bubbleTheirs: {
        borderBottomLeftRadius: 4,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    loadingContainer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surface,
    },
    timestampOverlay: {
        position: 'absolute',
        bottom: 6,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    timestamp: {
        fontSize: 10,
        color: '#fff',
    },
    statusIcon: {
        marginLeft: 4,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
