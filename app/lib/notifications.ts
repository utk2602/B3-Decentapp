import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Check if running in Expo Go (limited notification support)
const isExpoGo = Constants.appOwnership === 'expo';

// Configure notification behavior (wrap in try-catch for Expo Go compatibility)
export function configureNotifications() {
    try {
        if (!isExpoGo && Device.isDevice) {
            Notifications.setNotificationHandler({
                handleNotification: async () => ({
                    shouldShowAlert: true,
                    shouldPlaySound: true,
                    shouldSetBadge: true,
                    shouldShowBanner: true,
                    shouldShowList: true,
                }),
            });
        }
    } catch (error) {
        console.warn('Notification handler setup failed:', error);
    }
}

/**
 * Request permission and get push token
 */
export async function registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
        console.log('Push notifications require a physical device');
        return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Push notification permission denied');
        return null;
    }

    // Get the push token
    try {
        const token = await Notifications.getExpoPushTokenAsync({
            projectId: process.env.EXPO_PROJECT_ID, // Set in app.json
        });
        console.log('📱 Push token:', token.data);
        return token.data;
    } catch (error) {
        console.error('Failed to get push token:', error);
        return null;
    }
}

/**
 * Set up notification channel for Android
 */
export async function setupNotificationChannel(): Promise<void> {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('messages', {
            name: 'Messages',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#14F195',
            sound: 'default',
        });
    }
}

/**
 * Handle notification response (when user taps notification)
 */
export function addNotificationResponseListener(
    callback: (notification: Notifications.NotificationResponse) => void
): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Handle foreground notifications
 */
export function addNotificationListener(
    callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Schedule a local notification
 */
export async function sendLocalNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>
): Promise<void> {
    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            data,
            sound: 'default',
        },
        trigger: null,
    });
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
    await Notifications.dismissAllNotificationsAsync();
}

/**
 * Get badge count
 */
export async function getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
}
