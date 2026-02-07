/**
 * @deprecated This file is deprecated. Use functions from @/lib/api instead.
 *
 * Migration guide:
 * - createGroup() -> createGroupSimple() from api.ts
 * - inviteMember() -> inviteToGroup() from api.ts
 * - leaveGroup() -> leaveGroup() from api.ts
 * - getGroup() -> getGroupInfo() from api.ts
 * - syncGroups() -> getUserGroups() from api.ts
 *
 * Only local storage helper functions remain in this file.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const GROUPS_STORAGE_KEY = 'key_groups';

export interface Group {
    groupId: string;
    name: string;
    owner: string;
    members?: string[];
    createdAt?: number;
}

/**
 * Get locally cached groups
 */
export async function getLocalGroups(): Promise<Group[]> {
    try {
        const data = await AsyncStorage.getItem(GROUPS_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

/**
 * Save groups locally
 */
export async function saveLocalGroups(groups: Group[]): Promise<void> {
    await AsyncStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
}

/**
 * Clear locally cached groups
 */
export async function clearLocalGroups(): Promise<void> {
    await AsyncStorage.removeItem(GROUPS_STORAGE_KEY);
}
