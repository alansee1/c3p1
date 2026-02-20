interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// In-memory conversation history per conversation context
// Key format: threadTs for threads, or `dm:${channelId}` for DMs
// TODO: Phase 3 - persist to Supabase
const conversations = new Map<string, Message[]>();

const MAX_HISTORY = 20; // Keep last 20 messages per conversation

/**
 * Generate a conversation key based on context
 * - For threads: use the thread_ts (parent message timestamp)
 * - For DMs: use dm:channelId format
 */
export function getConversationKey(threadTs: string | undefined, channel: string, isDM: boolean): string {
  if (isDM) {
    return `dm:${channel}`;
  }
  // For channel messages, threadTs will be the parent thread or the message itself if starting a new thread
  return threadTs || `channel:${channel}`;
}

export function addMessage(conversationKey: string, role: 'user' | 'assistant', content: string): void {
  if (!conversations.has(conversationKey)) {
    conversations.set(conversationKey, []);
  }

  const history = conversations.get(conversationKey)!;
  history.push({ role, content });

  // Trim to max history
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

export function getHistory(conversationKey: string): Message[] {
  return conversations.get(conversationKey) || [];
}

export function clearHistory(conversationKey: string): void {
  conversations.delete(conversationKey);
}

export function hasConversation(conversationKey: string): boolean {
  return conversations.has(conversationKey) && conversations.get(conversationKey)!.length > 0;
}
