import React from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { useResponsive } from '@/hooks/useResponsive';

interface TabBarProps {
    state: any;
    descriptors: any;
    navigation: any;
}

export function LiquidTabBar({ state, descriptors, navigation }: TabBarProps) {
    const responsive = useResponsive();
    const TAB_WIDTH = responsive.tabBarWidth;
    const ITEM_WIDTH = TAB_WIDTH / 2;

    return (
        <View style={[styles.container, { width: responsive.screenWidth }]}>
            <BlurView intensity={30} tint="dark" style={[styles.glassPill, { width: TAB_WIDTH }]}>
                {/* The "Lamp Glow" effect behind the icons */}
                <View
                    style={[
                        styles.activeIndicator,
                        { 
                            transform: [{ translateX: state.index * ITEM_WIDTH }],
                            width: ITEM_WIDTH * 0.8,
                            left: ITEM_WIDTH * 0.1,
                        }
                    ]}
                />

                <View style={styles.iconRow}>
                    {state.routes.map((route: any, index: number) => {
                        const isFocused = state.index === index;

                        const onPress = () => {
                            if (isFocused) return;

                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true
                            });

                            if (!event.defaultPrevented) {
                                navigation.navigate(route.name);
                            }
                        };

                        // Icon mapping
                        let iconName: keyof typeof Ionicons.glyphMap = 'chatbubbles';
                        if (route.name === 'settings') iconName = 'settings';

                        return (
                            <Pressable
                                key={index}
                                onPress={onPress}
                                style={[styles.tabItem, { width: ITEM_WIDTH }]}
                                hitSlop={10}
                            >
                                <View style={[
                                    styles.iconWrapper,
                                    isFocused && styles.iconWrapperActive
                                ]}>
                                    <Ionicons
                                        name={isFocused ? iconName : `${iconName}-outline` as any}
                                        size={22}
                                        color={isFocused ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)'}
                                    />
                                    {isFocused && <View style={styles.activeDot} />}
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 34,
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    glassPill: {
        height: 64,
        borderRadius: 32,
        overflow: 'hidden',
        backgroundColor: 'rgba(10, 10, 10, 0.4)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.3,
                shadowRadius: 20,
            },
            android: {
                elevation: 10,
            },
        }),
    },
    iconRow: {
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        alignItems: 'center',
    },
    tabItem: {
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    iconWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    iconWrapperActive: {
        // No background here, we use the lamp glow below
    },
    activeIndicator: {
        position: 'absolute',
        height: '70%',
        backgroundColor: 'rgba(201, 169, 98, 0.15)', // Muted Gold Glow
        borderRadius: 20,
        zIndex: 1,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 15,
    },
    activeDot: {
        position: 'absolute',
        bottom: -6,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.primary,
        shadowColor: Colors.primary,
        shadowOpacity: 1,
        shadowRadius: 4,
    },
    activeIndicatorMint: {
        backgroundColor: 'rgba(52, 211, 153, 0.15)',
        shadowColor: Colors.accent,
    }
});
