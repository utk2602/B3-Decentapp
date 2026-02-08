import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Animated, Platform, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { Message, deleteMessage } from '@/lib/storage';
import { parseEmojis, customEmojis, hasCustomEmoji } from '@/lib/emojiRegistry';
import { Avatar } from './Avatar';
import { getResponsiveValues } from '@/hooks/useResponsive';

interface MessageBubbleProps {
    message: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    onReply?: () => void;
    onDelete?: () => void;
    onReport?: () => void;
    messageSignature?: string;
    senderPublicKey?: string | null;
}

export function MessageBubble({
    message,
    isFirstInGroup,
    isLastInGroup,
    onReply,
    onDelete,
    onReport,
    messageSignature,
    senderPublicKey,
}: MessageBubbleProps) {
    const swipeableRef = useRef<Swipeable>(null);
    const responsive = getResponsiveValues();

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStatusIcon = () => {
        switch (message.status) {
            case 'sending':
                return '○';
            case 'sent':
                return '✓';
            case 'confirmed':
                return '✓✓';
            case 'failed':
                return '✕';
            default:
                return '';
        }
    };

    const handleLongPress = () => {
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        
        // Show options for own messages, add Report for others' messages
        if (message.isMine) {
            onReply?.();
        } else {
            Alert.alert(
                'Message Options',
                '',
                [
                    {
                        text: 'Reply',
                        onPress: () => onReply?.()
                    },
                    {
                        text: 'Report',
                        style: 'destructive',
                        onPress: () => onReport?.()
                    },
                    { text: 'Cancel', style: 'cancel' }
                ]
            );
        }
    };

    const handleDelete = async () => {
        if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        await deleteMessage(message.chatId, message.id);
        onDelete?.();
        swipeableRef.current?.close();
    };

    // Calculate border radius based on grouping (Telegram-style)
    const getBorderRadius = () => {
        const base = 18;
        const small = 4;

        if (message.isMine) {
            return {
                borderTopLeftRadius: base,
                borderTopRightRadius: isFirstInGroup ? base : small,
                borderBottomLeftRadius: base,
                borderBottomRightRadius: isLastInGroup ? base : small,
            };
        } else {
            return {
                borderTopLeftRadius: isFirstInGroup ? base : small,
                borderTopRightRadius: base,
                borderBottomLeftRadius: isLastInGroup ? base : small,
                borderBottomRightRadius: base,
            };
        }
    };

    // Render message content with custom emoji support
    const renderContent = () => {
        if (!hasCustomEmoji(message.content)) {
            return (
                <Text
                    style={[
                        styles.text,
                        message.isMine ? styles.textMine : styles.textTheirs,
                    ]}
                >
                    {message.content}
                </Text>
            );
        }

        const segments = parseEmojis(message.content);
        return (
            <Text
                style={[
                    styles.text,
                    message.isMine ? styles.textMine : styles.textTheirs,
                ]}
            >
                {segments.map((segment, index) => {
                    if (segment.type === 'text') {
                        return <Text key={index}>{segment.content}</Text>;
                    } else {
                        return (
                            <Image
                                key={index}
                                source={customEmojis[segment.code]}
                                style={styles.inlineEmoji}
                                resizeMode="contain"
                            />
                        );
                    }
                })}
            </Text>
        );
    };

    // Render delete action when swiping left
    const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
        const translateX = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [80, 0],
        });

        return (
            <Animated.View style={[styles.deleteAction, { transform: [{ translateX }] }]}>
                <Pressable onPress={handleDelete} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={22} color="#fff" />
                    <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
            </Animated.View>
        );
    };



    const bubbleContent = (
        <View
            style={[
                styles.container,
                message.isMine ? styles.containerMine : styles.containerTheirs,
                isFirstInGroup && styles.firstInGroup,
                !isLastInGroup && styles.groupedMargin,
            ]}
        >
            {!message.isMine && (
                <View style={styles.avatarContainer}>
                    {isLastInGroup ? (
                        <Avatar username={message.chatId} size={28} />
                    ) : (
                        <View style={{ width: 28 }} />
                    )}
                </View>
            )}

            <Pressable
                onLongPress={handleLongPress}
                delayLongPress={300}
            >
                <View
                    style={[
                        styles.bubble,
                        message.isMine ? styles.bubbleMine : styles.bubbleTheirs,
                        getBorderRadius(),
                        { maxWidth: responsive.bubbleMaxWidth },
                    ]}
                >
                    {renderContent()}
                    <View style={styles.metaRow}>
                        <Text
                            style={[
                                styles.time,
                                message.isMine ? styles.timeMine : styles.timeTheirs,
                            ]}
                        >
                            {formatTime(message.timestamp)}
                        </Text>
                        {message.isMine && (
                            <Text
                                style={[
                                    styles.status,
                                    message.status === 'failed' && styles.statusFailed,
                                    message.status === 'confirmed' && styles.statusConfirmed,
                                ]}
                            >
                                {getStatusIcon()}
                            </Text>
                        )}
                    </View>
                </View>
            </Pressable>
        </View>
    );

    // On web, just render without swipeable
    if (Platform.OS === 'web') {
        return bubbleContent;
    }

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            friction={2}
            rightThreshold={40}
        >
            {bubbleContent}
        </Swipeable>
    );
}

const styles = StyleSheet.create({
    container: {
        marginHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    containerMine: {
        justifyContent: 'flex-end',
        marginVertical: 2,
    },
    containerTheirs: {
        justifyContent: 'flex-start',
        marginVertical: 2,
    },
    firstInGroup: {
        marginTop: 8,
    },
    groupedMargin: {
        marginVertical: 1,
    },
    bubble: {
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    bubbleMine: {
        backgroundColor: Colors.bubbleMine,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 1,
    },
    bubbleTheirs: {
        backgroundColor: Colors.bubbleTheirs,
    },
    text: {
        fontSize: 16,
        lineHeight: 22,
    },
    textMine: {
        color: Colors.bubbleTextMine,
    },
    textTheirs: {
        color: Colors.bubbleTextTheirs,
    },
    inlineEmoji: {
        width: 22,
        height: 22,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
        gap: 6,
    },
    time: {
        fontSize: 11,
    },
    timeMine: {
        color: 'rgba(0, 0, 0, 0.5)',
    },
    timeTheirs: {
        color: Colors.textMuted,
    },
    status: {
        fontSize: 12,
        color: 'rgba(0, 0, 0, 0.5)',
    },
    statusFailed: {
        color: Colors.error,
    },
    statusConfirmed: {
        color: '#0088cc',
    },
    deleteAction: {
        width: 80,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FF3B30',
        marginVertical: 2,
    },
    deleteButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    deleteText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    },
    avatarContainer: {
        marginRight: 8,
        justifyContent: 'flex-end',
    },
});
