import { app } from './app';
import { generateResponse } from '../llm/client';
import { addMessage, getHistory, getConversationKey, hasConversation } from '../llm/conversation';

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const status = 'status' in error ? (error as { status: number }).status : null;
    const statusPrefix = status ? `[${status}] ` : '';
    return `${statusPrefix}${error.message}`;
  }
  return `Error: ${String(error)}`;
}

// Handle direct messages and thread auto-replies
app.message(async ({ message, say, client }) => {
  // Only respond to actual user messages (not bot messages, not edits)
  if (message.subtype || !('text' in message) || !message.text) {
    return;
  }

  const userMessage = message.text;
  const channel = message.channel;

  // Check if this is a DM (channel starts with 'D')
  const isDM = channel.startsWith('D');

  // Check if this is a thread reply in a channel
  const threadTs = 'thread_ts' in message ? message.thread_ts : undefined;
  const isThreadReply = !isDM && !!threadTs;

  // Determine if we should respond:
  // 1. Always respond to DMs
  // 2. Respond to thread replies only if C3P1 is already participating
  if (!isDM && !isThreadReply) {
    // Channel message but not in a thread - ignore (require @mention to start)
    return;
  }

  const conversationKey = isDM
    ? getConversationKey(undefined, channel, true)
    : getConversationKey(threadTs, channel, false);

  // For thread replies, only respond if we're already in this conversation
  if (isThreadReply && !(await hasConversation(conversationKey))) {
    return;
  }

  try {
    // Show typing indicator
    const processingMsg = await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '_Processing..._',
    });

    // Add user message to history
    await addMessage(conversationKey, 'user', userMessage);

    // Generate response
    const history = await getHistory(conversationKey);
    const response = await generateResponse(history);

    // Add assistant response to history
    await addMessage(conversationKey, 'assistant', response);

    // Update the "Processing..." message with actual response
    await client.chat.update({
      channel,
      ts: processingMsg.ts!,
      text: response,
    });
  } catch (error) {
    console.error('Error handling message:', error);
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: formatErrorMessage(error),
    });
  }
});

// Handle @mentions in channels
app.event('app_mention', async ({ event, client }) => {
  const userId = event.user;
  if (!userId) {
    return;
  }

  // Remove the @mention from the message
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const channel = event.channel;

  // Determine thread context:
  // - If mentioned in a thread, event.thread_ts is the parent message ts
  // - If mentioned in channel (new thread), use event.ts as the thread parent
  const threadTs = event.thread_ts || event.ts;

  // Use thread timestamp as conversation key for channel messages
  const conversationKey = getConversationKey(threadTs, channel, false);

  if (!userMessage) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: 'Yes, sir? How may I assist you?',
    });
    return;
  }

  try {
    // Show typing indicator in thread
    const processingMsg = await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '_Processing..._',
    });

    // Add user message to history
    await addMessage(conversationKey, 'user', userMessage);

    // Generate response
    const history = await getHistory(conversationKey);
    const response = await generateResponse(history);

    // Add assistant response to history
    await addMessage(conversationKey, 'assistant', response);

    // Update the message with actual response
    await client.chat.update({
      channel,
      ts: processingMsg.ts!,
      text: response,
    });
  } catch (error) {
    console.error('Error handling mention:', error);
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: formatErrorMessage(error),
    });
  }
});
