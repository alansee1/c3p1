import * as db from '../db/queries';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const AGENT_ID = 'c3p1';
const MAX_HISTORY = 20;

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

export async function addMessage(conversationKey: string, role: 'user' | 'assistant', content: string): Promise<void> {
  await db.addMessage(
    conversationKey,
    role,
    content,
    role === 'assistant' ? AGENT_ID : undefined
  );
}

export async function getHistory(conversationKey: string): Promise<Message[]> {
  const messages = await db.getMessages(conversationKey, MAX_HISTORY);
  return messages.map(m => ({ role: m.role, content: m.content }));
}

export async function hasConversation(conversationKey: string): Promise<boolean> {
  return db.hasMessages(conversationKey);
}
