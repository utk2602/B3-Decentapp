import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

export interface CompressedImage {
    base64: string;
    width: number;
    height: number;
    mimeType: string;
}

// Max dimensions for compressed images
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 1024;
const COMPRESSION_QUALITY = 0.7;

/**
 * Request camera/photo library permissions
 */
export async function requestMediaPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return true;

    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    return cameraStatus === 'granted' || libraryStatus === 'granted';
}

/**
 * Pick an image from the gallery
 */
export async function pickImage(): Promise<CompressedImage | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
        base64: false, // We'll get base64 after compression
    });

    if (result.canceled || !result.assets[0]) {
        return null;
    }

    return compressImage(result.assets[0].uri);
}

/**
 * Take a photo with the camera
 */
export async function takePhoto(): Promise<CompressedImage | null> {
    const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 1,
        base64: false,
    });

    if (result.canceled || !result.assets[0]) {
        return null;
    }

    return compressImage(result.assets[0].uri);
}

/**
 * Compress an image and return base64
 */
export async function compressImage(uri: string): Promise<CompressedImage> {
    // Initial resize
    let result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 512, height: 512 } }], // Resize first to reasonable avatar dimensions
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    // If still too big (>400KB to be safe), compress more aggressively
    if (result.base64 && result.base64.length > 400 * 1024 * 1.33) {
        console.log('📉 Image too large, compressing further...');
        result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 400, height: 400 } }],
            { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
    }

    return {
        base64: result.base64 || '',
        width: result.width,
        height: result.height,
        mimeType: 'image/jpeg',
    };
}

/**
 * Convert file size to human readable format
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Estimate base64 size in bytes
 */
export function estimateBase64Size(base64: string): number {
    // Base64 encoding increases size by ~33%
    return Math.ceil(base64.length * 0.75);
}
