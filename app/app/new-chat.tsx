import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    Pressable,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { getPublicKeyByUsername } from '@/lib/api';
import { saveChat } from '@/lib/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_LARGE_SCREEN = SCREEN_WIDTH > 600;
const MAX_CONTENT_WIDTH = 400;

export default function NewChatScreen() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = async () => {
        const trimmed = username.trim().toLowerCase();
        if (!trimmed) return;

        setIsSearching(true);
        setError('');

        try {
            const user = await getPublicKeyByUsername(trimmed);

            if (!user) {
                setError('User not found');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setIsSearching(false);
                return;
            }

            // Save chat and navigate (1-on-1 chat, not a group)
            await saveChat({
                username: trimmed,
                publicKey: user.publicKey,
                isGroup: false,
                unreadCount: 0,
            });

            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace(`/chat/${trimmed}`);
        } catch (err) {
            setError('Failed to find user');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setIsSearching(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior="padding"
            keyboardVerticalOffset={0}
        >
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTransparent: true,
                    headerTitle: () => (
                        <Text style={styles.headerTitle}>New Chat</Text>
                    ),
                    headerLeft: () => (
                        <Pressable
                            onPress={() => router.back()}
                            style={styles.closeButton}
                        >
                            <Ionicons name="close" size={20} color={Colors.text} />
                        </Pressable>
                    ),
                }}
            />

            <View style={styles.content}>
                {/* Visual anchor */}
                <View style={styles.backgroundArt}>
                    <Text style={styles.watermark}>⚿</Text>
                </View>

                <View style={styles.formSection}>
                    <Text style={styles.label}>ENTER USERNAME</Text>

                    <View style={styles.inputContainer}>
                        <Text style={styles.atSymbol}>@</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={(text) => {
                                setUsername(text.replace(/[^a-zA-Z0-9_]/g, ''));
                                setError('');
                            }}
                            placeholder="username"
                            placeholderTextColor={Colors.textMuted}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoFocus
                            returnKeyType="search"
                            onSubmitEditing={handleSearch}
                        />
                    </View>

                    {error && <Text style={styles.error}>{error}</Text>}

                    <Pressable
                        style={({ pressed }) => [
                            styles.button,
                            (!username.trim() || isSearching) && styles.buttonDisabled,
                            pressed && styles.buttonPressed,
                        ]}
                        onPress={handleSearch}
                        disabled={!username.trim() || isSearching}
                    >
                        {isSearching ? (
                            <ActivityIndicator color={Colors.background} />
                        ) : (
                            <Text style={styles.buttonText}>Start Chat</Text>
                        )}
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '300',
        color: Colors.text,
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 100, // Account for transparent header
        width: '100%',
        maxWidth: IS_LARGE_SCREEN ? MAX_CONTENT_WIDTH : undefined,
        alignSelf: IS_LARGE_SCREEN ? 'center' : undefined,
    },
    backgroundArt: {
        position: 'absolute',
        top: 150,
        right: -30,
        opacity: 0.02,
    },
    watermark: {
        fontSize: 200,
        color: Colors.primary,
    },
    formSection: {
        zIndex: 1,
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.primary,
        letterSpacing: 2,
        marginBottom: 12,
        marginLeft: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 18,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    atSymbol: {
        fontSize: 20,
        color: Colors.primary,
        marginRight: 6,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    input: {
        flex: 1,
        fontSize: 20,
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    error: {
        color: Colors.error,
        fontSize: 13,
        marginBottom: 20,
        marginLeft: 4,
    },
    button: {
        backgroundColor: Colors.primary,
        paddingVertical: 18,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
    },
    buttonPressed: {
        transform: [{ scale: 0.98 }],
        opacity: 0.9,
    },
    buttonDisabled: {
        opacity: 0.4,
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.background,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
});
