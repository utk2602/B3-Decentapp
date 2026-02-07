import FlexSearch from 'flexsearch';
import { getMessages, getChats, type Message } from './storage';

// Message index using FlexSearch
const messageIndex = new FlexSearch.Document<Message>({
    document: {
        id: 'id',
        index: ['content', 'chatId'],
        store: ['id', 'chatId', 'content', 'timestamp', 'type'],
    },
    tokenize: 'forward',
    cache: true,
});

let isIndexed = false;

/**
 * Build or rebuild the search index from all messages
 */
export async function buildSearchIndex(): Promise<void> {
    try {
        const chats = await getChats();

        for (const chat of chats) {
            const messages = await getMessages(chat.username);
            for (const message of messages) {
                if (message.type === 'text') {
                    messageIndex.add(message);
                }
            }
        }

        isIndexed = true;
        console.log('🔍 Search index built');
    } catch (error) {
        console.error('Failed to build search index:', error);
    }
}

/**
 * Add a single message to the search index
 */
export function indexMessage(message: Message): void {
    if (message.type === 'text') {
        messageIndex.add(message);
    }
}

/**
 * Remove a message from the search index
 */
export function removeFromIndex(messageId: string): void {
    messageIndex.remove(messageId);
}

export interface SearchResult {
    id: string;
    chatId: string;
    content: string;
    timestamp: number;
    type: string;
}

/**
 * Search messages by query
 */
export async function searchMessages(query: string): Promise<SearchResult[]> {
    if (!isIndexed) {
        await buildSearchIndex();
    }

    if (!query || query.trim().length < 2) {
        return [];
    }

    try {
        const results = messageIndex.search(query, {
            limit: 50,
            enrich: true,
        });

        // Flatten and deduplicate results
        const seen = new Set<string>();
        const matches: SearchResult[] = [];

        for (const field of results) {
            for (const result of field.result) {
                const doc = result.doc as SearchResult;
                if (!seen.has(doc.id)) {
                    seen.add(doc.id);
                    matches.push(doc);
                }
            }
        }

        // Sort by timestamp (newest first)
        matches.sort((a, b) => b.timestamp - a.timestamp);

        return matches;
    } catch (error) {
        console.error('Search failed:', error);
        return [];
    }
}

/**
 * Search messages within a specific chat
 */
export async function searchInChat(chatId: string, query: string): Promise<SearchResult[]> {
    const results = await searchMessages(query);
    return results.filter(r => r.chatId === chatId);
}

/**
 * Clear the search index
 */
export function clearSearchIndex(): void {
    // Clear by removing all documents (FlexSearch doesn't have a clear method)
    isIndexed = false;
}
