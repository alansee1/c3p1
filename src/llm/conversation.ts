interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// In-memory conversation history per user
// TODO: Phase 3 - persist to Supabase
const conversations = new Map<string, Message[]>();

const MAX_HISTORY = 20; // Keep last 20 messages per user

export function addMessage(userId: string, role: 'user' | 'assistant', content: string): void {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }

  const history = conversations.get(userId)!;
  history.push({ role, content });

  // Trim to max history
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

export function getHistory(userId: string): Message[] {
  return conversations.get(userId) || [];
}

export function clearHistory(userId: string): void {
  conversations.delete(userId);
}
