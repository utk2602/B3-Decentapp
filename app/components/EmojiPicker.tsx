import React from 'react';
import {
    View,
    StyleSheet,
    Pressable,
    Modal,
    ScrollView,
    Text,
    Image,
    Platform,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { customEmojis, emojiCodes } from '@/lib/emojiRegistry';
import * as Haptics from 'expo-haptics';

interface EmojiPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelectEmoji: (code: string) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EMOJI_SIZE = Platform.OS === 'web' ? 48 : 44;
const EMOJIS_PER_ROW = Math.floor((SCREEN_WIDTH - 32) / (EMOJI_SIZE + 8));

export function EmojiPicker({ visible, onClose, onSelectEmoji }: EmojiPickerProps) {
    const handleSelect = (code: string) => {
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onSelectEmoji(code);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.handle} />
                        <Text style={styles.title}>Keymojis</Text>
                        <Pressable onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={Colors.text} />
                        </Pressable>
                    </View>

                    {/* Emoji Grid */}
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.grid}
                        showsVerticalScrollIndicator={false}
                    >
                        {emojiCodes.map((code) => (
                            <Pressable
                                key={code}
                                style={({ pressed }) => [
                                    styles.emojiButton,
                                    pressed && styles.emojiButtonPressed,
                                ]}
                                onPress={() => handleSelect(code)}
                            >
                                <Image
                                    source={customEmojis[code]}
                                    style={styles.emojiImage}
                                    resizeMode="contain"
                                />
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    container: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        minHeight: 350,
        maxHeight: '60%',
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    handle: {
        position: 'absolute',
        top: 8,
        left: '50%',
        marginLeft: -20,
        width: 40,
        height: 4,
        backgroundColor: Colors.textMuted,
        borderRadius: 2,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        flex: 1,
        textAlign: 'center',
    },
    closeButton: {
        padding: 4,
    },
    scrollView: {
        flex: 1,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 12,
        gap: 8,
        justifyContent: 'flex-start',
    },
    emojiButton: {
        width: EMOJI_SIZE,
        height: EMOJI_SIZE,
        borderRadius: 8,
        backgroundColor: Colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
    },
    emojiButtonPressed: {
        backgroundColor: Colors.primaryMuted,
        transform: [{ scale: 0.95 }],
    },
    emojiImage: {
        width: EMOJI_SIZE - 8,
        height: EMOJI_SIZE - 8,
    },
});
