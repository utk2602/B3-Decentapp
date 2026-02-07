import React, { useState, useEffect } from 'react';
import { Image, View, Text, StyleSheet, Platform, type ImageStyle } from 'react-native';
import { Colors } from '@/constants/Colors';
import { getAvatar } from '@/lib/api';

interface AvatarProps {
    username: string;
    size?: number;
    style?: ImageStyle;
    source?: string; // Optional override (e.g. for self)
}

export function Avatar({ username, size = 40, style, source }: AvatarProps) {
    const [avatarData, setAvatarData] = useState<string | null>(null);

    useEffect(() => {
        if (source) {
            setAvatarData(source);
            return;
        }

        let mounted = true;

        const loadAvatar = async () => {
            // Simple in-memory cache could go here, but for now just fetch
            // We could add a timestamp or cache-busting if needed
            const data = await getAvatar(username);
            if (mounted && data) {
                setAvatarData(`data:image/jpeg;base64,${data}`);
            }
        };

        loadAvatar();

        return () => {
            mounted = false;
        };
    }, [username, source]);

    if (!avatarData) {
        return (
            <View style={[
                styles.placeholder,
                { width: size, height: size, borderRadius: size / 2 },
                style
            ]}>
                <Text style={[styles.initials, { fontSize: size * 0.4 }]}>
                    {username.slice(0, 2).toUpperCase()}
                </Text>
            </View>
        );
    }

    return (
        <Image
            source={{ uri: avatarData }}
            style={[
                { width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.surface },
                style
            ]}
        />
    );
}

const styles = StyleSheet.create({
    placeholder: {
        backgroundColor: Colors.primaryMuted,
        justifyContent: 'center',
        alignItems: 'center',
    },
    initials: {
        color: Colors.primary,
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
});
