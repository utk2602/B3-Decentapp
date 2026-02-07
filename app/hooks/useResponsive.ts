import { useState, useEffect } from 'react';
import { Dimensions, Platform, ScaledSize } from 'react-native';

export interface ResponsiveValues {
  // Screen dimensions (reactive to orientation changes)
  screenWidth: number;
  screenHeight: number;
  
  // Device type flags
  isIPad: boolean;
  isLargeScreen: boolean;
  isWeb: boolean;
  
  // Layout values (auto-computed based on screen size)
  contentMaxWidth: number;
  chatMaxWidth: number;
  modalMaxWidth: number;
  bubbleMaxWidth: number;
  tabBarWidth: number;
  
  // Padding values
  horizontalPadding: number;
  
  // Helper for responsive font sizes
  fontSize: (base: number, scaleFactor?: number) => number;
}

const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
};

function calculateValues(width: number, height: number): ResponsiveValues {
  const isWeb = Platform.OS === 'web';
  const isIPad = Platform.OS === 'ios' && Platform.isPad === true;
  const isLargeScreen = width >= BREAKPOINTS.tablet || isIPad;
  
  // Content widths - more generous on iPad for better readability
  const contentMaxWidth = isWeb 
    ? Math.min(width - 48, 600)
    : isLargeScreen 
      ? Math.min(width * 0.75, 700)
      : width;
  
  // Chat/message list width
  const chatMaxWidth = isWeb
    ? Math.min(width - 48, 800)
    : isLargeScreen
      ? Math.min(width * 0.85, 900)
      : width;
  
  // Modal width
  const modalMaxWidth = isWeb
    ? Math.min(width - 48, 450)
    : isLargeScreen
      ? Math.min(width * 0.6, 500)
      : width - 48;
  
  // Message bubble max width - wider on large screens
  const bubbleMaxWidth = isLargeScreen ? 400 : 280;
  
  // Tab bar width - proportional but with reasonable min/max
  const tabBarWidth = isWeb
    ? Math.min(width * 0.4, 240)
    : isLargeScreen
      ? Math.min(width * 0.35, 280)
      : width * 0.55;
  
  // Horizontal padding
  const horizontalPadding = isLargeScreen ? 32 : 20;
  
  // Font size helper - slightly larger on iPad for better readability
  const fontSize = (base: number, scaleFactor = 1.1): number => {
    return isLargeScreen ? Math.round(base * scaleFactor) : base;
  };
  
  return {
    screenWidth: width,
    screenHeight: height,
    isIPad,
    isLargeScreen,
    isWeb,
    contentMaxWidth,
    chatMaxWidth,
    modalMaxWidth,
    bubbleMaxWidth,
    tabBarWidth,
    horizontalPadding,
    fontSize,
  };
}

/**
 * Hook that provides responsive layout values and updates on dimension changes.
 * Handles iPad, web, and phone layouts consistently.
 */
export function useResponsive(): ResponsiveValues {
  const [dimensions, setDimensions] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return calculateValues(width, height);
  });

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
      setDimensions(calculateValues(window.width, window.height));
    });

    return () => subscription?.remove();
  }, []);

  return dimensions;
}

/**
 * Get responsive values without reactivity (for static styles).
 * Use this in StyleSheet.create() or when you don't need updates.
 */
export function getResponsiveValues(): ResponsiveValues {
  const { width, height } = Dimensions.get('window');
  return calculateValues(width, height);
}

/**
 * Helper to get container styles for centered content
 */
export function getContentContainerStyle(responsive: ResponsiveValues) {
  if (responsive.isWeb || responsive.isLargeScreen) {
    return {
      maxWidth: responsive.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
      paddingHorizontal: responsive.horizontalPadding,
    };
  }
  return {};
}

/**
 * Helper to get container styles for chat/message lists
 */
export function getChatContainerStyle(responsive: ResponsiveValues) {
  if (responsive.isWeb || responsive.isLargeScreen) {
    return {
      maxWidth: responsive.chatMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
      paddingHorizontal: responsive.horizontalPadding,
    };
  }
  return {};
}
