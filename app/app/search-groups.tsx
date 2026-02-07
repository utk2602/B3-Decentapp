import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    FlatList,
    Pressable,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { searchPublicGroups, lookupGroupByCode, type GroupInfo } from '@/lib/api';

export default function SearchGroupsScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [codeQuery, setCodeQuery] = useState('');
    const [searchResults, setSearchResults] = useState<GroupInfo[]>([]);
    const [codeResult, setCodeResult] = useState<GroupInfo | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'search' | 'code'>('search');

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        setError('');

        try {
            const { groups } = await searchPublicGroups(searchQuery.trim());
            setSearchResults(groups);

            if (groups.length === 0) {
                setError('No public groups found');
            }
        } catch (err: any) {
            setError(err.message || 'Search failed');
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleLookupCode = async () => {
        const trimmedCode = codeQuery.trim().toLowerCase().replace('@', '');

        if (!trimmedCode) {
            setCodeResult(null);
            setError('');
            return;
        }

        setIsSearching(true);
        setError('');

        try {
            const group = await lookupGroupByCode(trimmedCode);
            setCodeResult(group);
            setError('');
        } catch (err: any) {
            setError(err.message || 'Group not found');
            setCodeResult(null);
        } finally {
            setIsSearching(false);
        }
    };

    const handleJoinGroup = (group: GroupInfo) => {
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        // Navigate to join confirmation or group chat
        router.push(`/group/${group.groupId}`);
    };

    const renderGroupItem = ({ item }: { item: GroupInfo }) => (
        <Pressable
            style={({ pressed }) => [
                styles.groupItem,
                pressed && styles.groupItemPressed,
            ]}
            onPress={() => handleJoinGroup(item)}
        >
            <View style={styles.groupIcon}>
                <Ionicons name="people" size={24} color={Colors.primary} />
            </View>
            <View style={styles.groupInfo}>
                <Text style={styles.groupName}>{item.name}</Text>
                {item.description && (
                    <Text style={styles.groupDescription} numberOfLines={2}>
                        {item.description}
                    </Text>
                )}
                <View style={styles.groupMeta}>
                    <Text style={styles.groupMetaText}>
                        {item.memberCount || 0} members
                    </Text>
                    {item.publicCode && (
                        <Text style={styles.groupCode}>@{item.publicCode}</Text>
                    )}
                </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </Pressable>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTransparent: true,
                    headerTitle: () => (
                        <Text style={styles.headerTitle}>Find Groups</Text>
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
                {/* Tab Switcher */}
                <View style={styles.tabContainer}>
                    <Pressable
                        style={[styles.tab, activeTab === 'search' && styles.tabActive]}
                        onPress={() => setActiveTab('search')}
                    >
                        <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>
                            Search
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[styles.tab, activeTab === 'code' && styles.tabActive]}
                        onPress={() => setActiveTab('code')}
                    >
                        <Text style={[styles.tabText, activeTab === 'code' && styles.tabTextActive]}>
                            Join by Code
                        </Text>
                    </Pressable>
                </View>

                {activeTab === 'search' ? (
                    <>
                        {/* Search Input */}
                        <View style={styles.searchContainer}>
                            <Ionicons name="search" size={20} color={Colors.textMuted} />
                            <TextInput
                                style={styles.searchInput}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search public groups..."
                                placeholderTextColor={Colors.textMuted}
                                autoCapitalize="none"
                                autoCorrect={false}
                                returnKeyType="search"
                                onSubmitEditing={handleSearch}
                            />
                            {searchQuery.length > 0 && (
                                <Pressable onPress={() => setSearchQuery('')}>
                                    <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                                </Pressable>
                            )}
                        </View>

                        {/* Search Button */}
                        <Pressable
                            style={({ pressed }) => [
                                styles.searchButton,
                                pressed && styles.searchButtonPressed,
                            ]}
                            onPress={handleSearch}
                        >
                            {isSearching ? (
                                <ActivityIndicator color={Colors.background} />
                            ) : (
                                <Text style={styles.searchButtonText}>Search</Text>
                            )}
                        </Pressable>

                        {error && <Text style={styles.error}>{error}</Text>}

                        {/* Results */}
                        <FlatList
                            data={searchResults}
                            keyExtractor={(item) => item.groupId}
                            renderItem={renderGroupItem}
                            contentContainerStyle={styles.listContent}
                            ListEmptyComponent={
                                searchQuery && !isSearching && searchResults.length === 0 ? (
                                    <View style={styles.emptyContainer}>
                                        <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
                                        <Text style={styles.emptyText}>No groups found</Text>
                                    </View>
                                ) : null
                            }
                        />
                    </>
                ) : (
                    <>
                        {/* Code Input */}
                        <View style={styles.codeInputContainer}>
                            <Text style={styles.atSymbol}>@</Text>
                            <TextInput
                                style={styles.codeInput}
                                value={codeQuery}
                                onChangeText={(text) => {
                                    setCodeQuery(text.replace(/[^a-zA-Z0-9_]/g, ''));
                                    setError('');
                                }}
                                placeholder="groupcode"
                                placeholderTextColor={Colors.textMuted}
                                autoCapitalize="none"
                                autoCorrect={false}
                                returnKeyType="search"
                                onSubmitEditing={handleLookupCode}
                            />
                        </View>

                        <Pressable
                            style={({ pressed }) => [
                                styles.searchButton,
                                pressed && styles.searchButtonPressed,
                            ]}
                            onPress={handleLookupCode}
                        >
                            {isSearching ? (
                                <ActivityIndicator color={Colors.background} />
                            ) : (
                                <Text style={styles.searchButtonText}>Lookup</Text>
                            )}
                        </Pressable>

                        {error && <Text style={styles.error}>{error}</Text>}

                        {/* Code Result */}
                        {codeResult && (
                            <View style={styles.codeResultContainer}>
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.groupItem,
                                        pressed && styles.groupItemPressed,
                                    ]}
                                    onPress={() => handleJoinGroup(codeResult)}
                                >
                                    <View style={styles.groupIcon}>
                                        <Ionicons name="people" size={24} color={Colors.primary} />
                                    </View>
                                    <View style={styles.groupInfo}>
                                        <Text style={styles.groupName}>{codeResult.name}</Text>
                                        {codeResult.description && (
                                            <Text style={styles.groupDescription} numberOfLines={2}>
                                                {codeResult.description}
                                            </Text>
                                        )}
                                        <View style={styles.groupMeta}>
                                            <Text style={styles.groupMetaText}>
                                                {codeResult.memberCount || 0} members
                                            </Text>
                                            <Text style={styles.groupCode}>@{codeResult.publicCode}</Text>
                                        </View>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                                </Pressable>
                            </View>
                        )}
                    </>
                )}
            </View>
        </View>
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
        paddingTop: 100,
        paddingHorizontal: 24,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 24,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 8,
    },
    tabActive: {
        backgroundColor: Colors.primary,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    tabTextActive: {
        color: Colors.background,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        gap: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: Colors.text,
    },
    codeInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    atSymbol: {
        fontSize: 18,
        color: Colors.primary,
        marginRight: 6,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    codeInput: {
        flex: 1,
        fontSize: 16,
        color: Colors.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    searchButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 24,
    },
    searchButtonPressed: {
        opacity: 0.8,
    },
    searchButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.background,
    },
    error: {
        color: Colors.error,
        fontSize: 13,
        marginBottom: 16,
        marginLeft: 4,
    },
    listContent: {
        paddingBottom: 40,
    },
    groupItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        gap: 12,
    },
    groupItemPressed: {
        opacity: 0.7,
    },
    groupIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
    },
    groupInfo: {
        flex: 1,
    },
    groupName: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 4,
    },
    groupDescription: {
        fontSize: 13,
        color: Colors.textMuted,
        marginBottom: 6,
    },
    groupMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    groupMetaText: {
        fontSize: 12,
        color: Colors.textMuted,
    },
    groupCode: {
        fontSize: 12,
        color: Colors.primary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        fontSize: 16,
        color: Colors.textMuted,
        marginTop: 12,
    },
    codeResultContainer: {
        marginTop: 8,
    },
});
