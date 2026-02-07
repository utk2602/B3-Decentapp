import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Platform, Alert } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Chat } from '@/lib/storage';
import { useRouter } from 'expo-router';
import { emojiCodes } from '@/lib/emojiRegistry';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ChatListItemProps {
    chat: Chat;
    onDelete?: () => void;
}

export function ChatListItem({ chat, onDelete }: ChatListItemProps) {
    const router = useRouter();
    const swipeableRef = useRef<Swipeable>(null);

    const formatTime = (timestamp?: number) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        if (isToday) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    // Format emoji codes to readable text for preview (e.g., :pepecool: → 🐸)
    const formatEmojiPreview = (text: string): string => {
        let result = text;
        for (const code of emojiCodes) {
            // Replace emoji codes with a frog emoji for preview
            result = result.replace(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '🐸');
        }
        return result;
    };

    const handlePress = () => {
        if (chat.isGroup && chat.groupId) {
            router.push(`/group/${chat.groupId}`);
        } else if (chat.username) {
            router.push(`/chat/${chat.username}`);
        }
    };

    const toggleDelete = () => {
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }

        const chatName = chat.isGroup ? chat.groupName : `@${chat.username}`;
        Alert.alert(
            "Delete Chat",
            `Are you sure you want to delete your chat with ${chatName}? This cannot be undone.`,
            [
                {
                    text: "Cancel",
                    onPress: () => swipeableRef.current?.close(),
                    style: "cancel"
                },
                {
                    text: "Delete",
                    onPress: () => {
                        swipeableRef.current?.close();
                        if (onDelete) onDelete();
                    },
                    style: "destructive"
                }
            ]
        );
    };

    const renderRightActions = (
        progress: Animated.AnimatedInterpolation<number>,
        dragX: Animated.AnimatedInterpolation<number>
    ) => {
        const trans = dragX.interpolate({
            inputRange: [-100, 0],
            outputRange: [0, 100],
            extrapolate: 'clamp',
        });

        return (
            <Pressable
                style={styles.deleteAction}
                onPress={toggleDelete}
            >
                <Animated.View
                    style={[
                        styles.deleteActionContent,
                        { transform: [{ translateX: trans }] },
                    ]}
                >
                    <Ionicons name="trash-outline" size={24} color="white" />
                    <Text style={styles.deleteActionText}>Delete</Text>
                </Animated.View>
            </Pressable>
        );
    };

    // Get display name and avatar content
    const displayName = chat.isGroup ? chat.groupName! : `@${chat.username!}`;
    const avatarContent = chat.isGroup ? (
        <Ionicons name="people" size={24} color={Colors.background} />
    ) : (
        <Text style={styles.avatarText}>
            {chat.username!.charAt(0).toUpperCase()}
        </Text>
    );

    // On web, we cannot use Swipeable easily without issues, so we just render content
    // Or we could add a delete button visible on hover/long press.
    // For now we'll stick to mobile swipe.
    if (Platform.OS === 'web') {
        return (
            <Pressable
                style={({ pressed }) => [
                    styles.container,
                    pressed && styles.pressed,
                ]}
                onPress={handlePress}
            >
                {/* Avatar */}
                <View style={styles.avatar}>
                    {avatarContent}
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <View style={styles.row}>
                        <Text style={styles.username}>{displayName}</Text>
                        <Text style={styles.time}>{formatTime(chat.lastMessageTime)}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.lastMessage} numberOfLines={1}>
                            {chat.lastMessage ? formatEmojiPreview(chat.lastMessage) : 'No messages yet'}
                        </Text>
                        {chat.unreadCount > 0 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>
                                    {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </Pressable>
        );
    }

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            friction={2}
            rightThreshold={40}
        >
            <Pressable
                style={({ pressed }) => [
                    styles.container,
                    pressed && styles.pressed,
                ]}
                onPress={handlePress}
            >
                {/* Avatar */}
                <View style={styles.avatar}>
                    {avatarContent}
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <View style={styles.row}>
                        <Text style={styles.username}>{displayName}</Text>
                        <Text style={styles.time}>{formatTime(chat.lastMessageTime)}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.lastMessage} numberOfLines={1}>
                            {chat.lastMessage ? formatEmojiPreview(chat.lastMessage) : 'No messages yet'}
                        </Text>
                        {chat.unreadCount > 0 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>
                                    {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </Pressable>
        </Swipeable>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: Colors.background,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    },
    pressed: {
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
    },
    avatar: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '600',
        color: Colors.background,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    username: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        letterSpacing: 0.2,
    },
    time: {
        fontSize: 12,
        color: Colors.textMuted,
        opacity: 0.6,
    },
    lastMessage: {
        fontSize: 14,
        color: Colors.textSecondary,
        flex: 1,
        marginTop: 4,
        marginRight: 8,
        opacity: 0.8,
    },
    badge: {
        backgroundColor: Colors.primary,
        borderRadius: 14,
        minWidth: 26,
        height: 26,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.background,
    },
    deleteAction: {
        backgroundColor: '#ef4444',
        justifyContent: 'center',
        alignItems: 'flex-end',
        width: 100,
    },
    deleteActionContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
    },
    deleteActionText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 12,
        marginTop: 4,
    },
});
