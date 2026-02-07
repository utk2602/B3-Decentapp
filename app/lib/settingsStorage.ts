import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_SETTINGS_KEY = 'key_user_settings';

export interface UserSettings {
    // Chat appearance
    chatBackgroundColor?: string;
    chatBackgroundImage?: string; // base64 encoded

    // Profile
    avatarBase64?: string;

    // Theme accent color
    accentColor?: string;

    // Security: When true, identity stored locally only (no iCloud sync)
    // Deleting the app = identity gone forever
    ephemeralMode?: boolean;
}

/**
 * Get current user settings
 */
export async function getUserSettings(): Promise<UserSettings> {
    try {
        const data = await AsyncStorage.getItem(USER_SETTINGS_KEY);
        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
}

/**
 * Save user settings
 */
export async function saveUserSettings(settings: UserSettings): Promise<void> {
    const current = await getUserSettings();
    const merged = { ...current, ...settings };
    await AsyncStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(merged));
}

/**
 * Update a single setting
 */
export async function updateSetting<K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
): Promise<void> {
    const settings = await getUserSettings();
    settings[key] = value;
    await AsyncStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Clear all user settings
 */
export async function clearUserSettings(): Promise<void> {
    await AsyncStorage.removeItem(USER_SETTINGS_KEY);
}

// Preset background colors (matching the dark theme)
// Preset background colors (Japanese Traditional Colors - Nippon Colors)
// Preset background colors (Japanese Traditional Colors - Nippon Colors)
// Preset background colors (Japanese Traditional Colors - Nippon Colors)
// Preset background colors (Japanese Traditional Colors - Nippon Colors)
export const CHAT_BACKGROUND_PRESETS = [
    '#050505', // Sumi (Black Ink)
    '#2F3E46', // Aojiro-tsurubami (Dark Slate Green)
    '#20332E', // Chitose-midori (Pine Green)
    '#4A201E', // Ebicha (Maroon)
    'gradient: ["#0F2027", "#203A43", "#2C5364"]', // Deep Space (Blue Gradient)
    'gradient: ["#232526", "#414345"]', // Midnight City (Grey Gradient) - Re-added as per layout fit (6 + camera = 7)
    'custom:camera', // Camera placeholder for custom image
];

// Accent color presets
export const ACCENT_COLOR_PRESETS = [
    '#C9A962', // Gold (default)
    '#4FC3F7', // Ice blue
    '#34D399', // Mint
    '#F472B6', // Pink
    '#A78BFA', // Purple
    '#FB923C', // Orange
];
