import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { getChats, type Chat, deleteChat, saveChat, saveMessage, generateMessageId, isSignatureProcessed, addProcessedSignature } from '@/lib/storage';
import { getStoredUsername, getStoredKeypair } from '@/lib/keychain';
import { ChatListItem } from '@/components/ChatListItem';
import { onNewMessage } from '@/lib/websocket';
import { fetchInbox, getUsernameByOwner, getUserGroups } from '@/lib/api';
import { uint8ToBase58, base64ToUint8, getEncryptionKeypair, decryptMessage } from '@/lib/crypto';
import { useResponsive, getChatContainerStyle } from '@/hooks/useResponsive';

export default function ChatsScreen() {
  const router = useRouter();
  const responsive = useResponsive();
  const [chats, setChats] = useState<Chat[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  // Reload chat list whenever screen comes into focus (fixes unread count bug)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  useEffect(() => {
    // Subscribe to new messages to refresh chat list automatically
    const unsubscribe = onNewMessage((_message) => {
      loadData(); // Reload chat list when new message arrives
    });

    // Poll for new messages every 30 seconds (fallback if WebSocket misses messages)
    // This is critical for receiving messages from NEW contacts
    pollForNewMessages();
    const pollInterval = setInterval(pollForNewMessages, 30000); // 30 seconds

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  const loadData = async () => {
    const [storedChats, storedUsername, keypair] = await Promise.all([
      getChats(),
      getStoredUsername(),
      getStoredKeypair(),
    ]);

    // Fetch user's groups from API and merge with local chats
    if (keypair) {
      try {
        const myPubkey = uint8ToBase58(keypair.publicKey);
        const { groups } = await getUserGroups(myPubkey);

        // Add groups to chats if not already present
        for (const group of groups) {
          const existingGroup = storedChats.find(c => c.isGroup && c.groupId === group.groupId);
          if (!existingGroup) {
            const groupChat: Chat = {
              isGroup: true,
              groupId: group.groupId,
              groupName: group.name,
              participants: group.members,
              unreadCount: 0,
            };
            await saveChat(groupChat);
            storedChats.push(groupChat);
          }
        }
      } catch (error) {
        console.error('Failed to fetch groups:', error);
      }
    }

    setChats(storedChats);
    setUsername(storedUsername);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleDeleteChat = async (chatUsername: string) => {
    await deleteChat(chatUsername);
    setChats(prev => prev.filter(c => c.username !== chatUsername));
  };

  /**
   * Poll for new messages from ALL contacts (not just current chat)
   * This ensures messages from new contacts show up even if WebSocket misses them
   */
  const pollForNewMessages = async () => {
    try {
      const keypair = await getStoredKeypair();
      if (!keypair) return;

      const myPubkey = uint8ToBase58(keypair.publicKey);

      // Fetch messages from the last hour
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
      const { messages: inboxMessages } = await fetchInbox(myPubkey, oneHourAgo);

      if (inboxMessages.length === 0) return;

      const encryptionKeypair = getEncryptionKeypair(keypair);
      let newMessagesFound = false;

      for (const msg of inboxMessages) {
        const alreadyProcessed = await isSignatureProcessed(msg.signature);
        if (alreadyProcessed) continue;

        if (msg.encryptedMessage.startsWith('group:')) {
          const parts = msg.encryptedMessage.split(':');
          if (parts.length === 3) {
            const groupId = parts[1];

            const storedChats = await getChats();
            const groupChat = storedChats.find(c => c.isGroup && c.groupId === groupId);
            if (groupChat) {
              await saveChat({
                ...groupChat,
                lastMessage: 'New group message',
                lastMessageTime: msg.timestamp * 1000,
                unreadCount: (groupChat.unreadCount || 0) + 1,
              });
              newMessagesFound = true;
            }
          }

          await addProcessedSignature(msg.signature);
          continue;
        }

        const senderData = await getUsernameByOwner(msg.senderPubkey);
        if (!senderData?.username || !senderData?.encryptionKey) {
          await addProcessedSignature(msg.signature);
          continue;
        }

        try {
          const senderEncryptionKey = base64ToUint8(senderData.encryptionKey);
          const decryptedText = decryptMessage(
            msg.encryptedMessage,
            senderEncryptionKey,
            encryptionKeypair.secretKey
          );

          let finalContent = decryptedText;
          if (finalContent.startsWith('ar:')) {
            const arweaveTxId = finalContent.substring(3);
            try {
              const arweaveResponse = await fetch(`https://devnet.irys.xyz/${arweaveTxId}`);
              if (arweaveResponse.ok) {
                finalContent = await arweaveResponse.text();
              }
            } catch {
              finalContent = 'Error: Arweave content unavailable';
            }
          }

          let type: 'text' | 'image' = 'text';
          let mimeType: string | undefined;
          let width: number | undefined;
          let height: number | undefined;

          if (finalContent.startsWith('IMG:')) {
            type = 'image';
            const parts = finalContent.substring(4).split(':');

            if (parts.length === 4) {
              mimeType = parts[0];
              width = parseInt(parts[1], 10);
              height = parseInt(parts[2], 10);
              finalContent = parts[3];
            } else {
              finalContent = finalContent.substring(4);
              mimeType = 'image/jpeg';
            }
          }

          const newMessage = {
            id: generateMessageId(),
            chatId: senderData.username,
            type,
            content: finalContent,
            mimeType,
            width,
            height,
            timestamp: msg.timestamp * 1000,
            isMine: false,
            status: 'confirmed' as const,
            txSignature: msg.signature,
          };

          await saveMessage(newMessage);
          await addProcessedSignature(msg.signature);

          await saveChat({
            username: senderData.username,
            publicKey: msg.senderPubkey,
            isGroup: false,
            lastMessage: type === 'image' ? '📷 Photo' : finalContent,
            lastMessageTime: msg.timestamp * 1000,
            unreadCount: 1,
          });

          newMessagesFound = true;
          console.log(`📩 Global poll: New message from @${senderData.username}`);
        } catch (decryptError) {
          await addProcessedSignature(msg.signature);
          console.log('Failed to decrypt message during global poll:', decryptError);
        }
      }

      if (newMessagesFound) {
        await loadData();
      }
    } catch (error) {
      console.error('Global message poll failed:', error);
      // Don't show error to user - this is a background operation
    }
  };

  return (
    <View style={styles.container}>
      {/* Glass Header */}
      <BlurView intensity={60} tint="dark" style={styles.header}>
        <View style={[styles.headerContent, responsive.isLargeScreen && { maxWidth: responsive.chatMaxWidth, alignSelf: 'center', width: '100%' }]}>
          <Text style={styles.headerTitle}>Messages</Text>
          {username && (
            <Text style={styles.headerSubtitle}>@{username}</Text>
          )}
        </View>
      </BlurView>

      {chats.length === 0 ? (
        <View style={[styles.emptyContainer, responsive.isLargeScreen && { paddingHorizontal: responsive.horizontalPadding }]}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={64} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>
            Start an encrypted conversation
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.newChatButton,
              pressed && styles.newChatButtonPressed,
            ]}
            onPress={() => router.push('/new-chat')}
          >
            <Ionicons name="add" size={20} color={Colors.background} />
            <Text style={styles.newChatButtonText}>New Chat</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.isGroup ? item.groupId! : item.username!}
          renderItem={({ item }) => (
            <ChatListItem
              chat={item}
              onDelete={() => {
                if (item.isGroup && item.groupId) {
                  handleDeleteChat(item.groupId);
                } else if (item.username) {
                  handleDeleteChat(item.username);
                }
              }}
            />
          )}
          contentContainerStyle={[styles.listContent, getChatContainerStyle(responsive)]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      )}

      {/* Floating Action Buttons */}
      {chats.length > 0 && (
        <>
          {/* New Chat Button */}
          <Pressable
            style={({ pressed }) => [
              styles.fab,
              pressed && styles.fabPressed,
              responsive.isLargeScreen && { right: Math.max(20, (responsive.screenWidth - responsive.chatMaxWidth) / 2 + 20) },
            ]}
            onPress={() => router.push('/new-chat')}
          >
            <BlurView intensity={80} tint="dark" style={styles.fabBlur}>
              <Ionicons name="chatbubble" size={24} color={Colors.text} />
            </BlurView>
          </Pressable>

          {/* New Group Button */}
          <Pressable
            style={({ pressed }) => [
              styles.fabSecondary,
              pressed && styles.fabPressed,
              responsive.isLargeScreen && { right: Math.max(20, (responsive.screenWidth - responsive.chatMaxWidth) / 2 + 20) },
            ]}
            onPress={() => router.push('/new-group')}
          >
            <BlurView intensity={80} tint="dark" style={styles.fabBlur}>
              <Ionicons name="people" size={24} color={Colors.text} />
            </BlurView>
          </Pressable>

          {/* Search Groups Button */}
          <Pressable
            style={({ pressed }) => [
              styles.fabTertiary,
              pressed && styles.fabPressed,
              responsive.isLargeScreen && { right: Math.max(20, (responsive.screenWidth - responsive.chatMaxWidth) / 2 + 20) },
            ]}
            onPress={() => router.push('/search-groups')}
          >
            <BlurView intensity={80} tint="dark" style={styles.fabBlur}>
              <Ionicons name="search" size={24} color={Colors.text} />
            </BlurView>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerContent: {
    width: '100%',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '300',
    color: Colors.text,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  listContent: {
    paddingVertical: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 120,
    paddingHorizontal: 40,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  chatItemPressed: {
    backgroundColor: Colors.surfaceLight,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  chatContent: {
    flex: 1,
    marginLeft: 14,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  username: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  time: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  lastMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  unreadText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.background,
  },
  emptyIcon: {
    marginBottom: 20,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '300',
    color: Colors.text,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 32,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
    gap: 8,
  },
  newChatButtonPressed: {
    opacity: 0.8,
  },
  newChatButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.background,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 110, // Above floating tab bar
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabSecondary: {
    position: 'absolute',
    right: 20,
    bottom: 180, // Above main FAB
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  fabTertiary: {
    position: 'absolute',
    right: 20,
    bottom: 240, // Above secondary FAB
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  fabPressed: {
    transform: [{ scale: 0.95 }],
  },
  fabBlur: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryMuted,
  },
});
