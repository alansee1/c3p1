import { app } from './app';
import { generateResponse } from '../llm/client';
import { addMessage, getHistory, getConversationKey, hasConversation } from '../llm/conversation';
import { replyToTweet } from '../twitter/client';
import { pendingReplies } from '../scheduler/tasks/twitter-mentions';
import { logActionReceipt } from '../db/queries';

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
    const response = await generateResponse(history, conversationKey);

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
    const response = await generateResponse(history, conversationKey);

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

// Handle X reply approval button
app.action(/^approve_reply_/, async ({ action, ack, client, body }) => {
  await ack();

  if (!('action_id' in action)) return;

  // Extract mention ID from action_id (format: approve_reply_<mentionId>)
  const mentionId = action.action_id.replace('approve_reply_', '');
  const pending = pendingReplies.get(mentionId);

  if (!pending) {
    await client.chat.postMessage({
      channel: body.channel?.id || '',
      text: 'This reply approval has expired. Please run the mentions check again.',
    });
    return;
  }

  try {
    // Post the reply to X
    const result = await replyToTweet(pending.mention.id, pending.draftReply);

    if (result.success) {
      // Update the Slack message to show it was approved
      await client.chat.update({
        channel: pending.slackChannel,
        ts: pending.slackTs,
        text: `Reply posted to @${pending.mention.authorUsername}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Replied to @${pending.mention.authorUsername}:*\n${pending.draftReply}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Posted | <https://twitter.com/c_3p1_agent/status/${result.tweetId}|View reply>`,
              },
            ],
          },
        ],
      });

      // Log the action
      await logActionReceipt(
        'conversation',
        `slack_approval_${mentionId}`,
        'x_reply_posted',
        `Replied to @${pending.mention.authorUsername}`,
        {
          mentionId,
          replyTweetId: result.tweetId,
          replyText: pending.draftReply,
        }
      );
    } else {
      await client.chat.postMessage({
        channel: pending.slackChannel,
        thread_ts: pending.slackTs,
        text: `Failed to post reply: ${result.error}`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await client.chat.postMessage({
      channel: pending.slackChannel,
      thread_ts: pending.slackTs,
      text: `Error posting reply: ${message}`,
    });
  } finally {
    // Clean up pending reply
    pendingReplies.delete(mentionId);
  }
});

// Handle X reply ignore button
app.action(/^ignore_reply_/, async ({ action, ack, client }) => {
  await ack();

  if (!('action_id' in action)) return;

  // Extract mention ID from action_id
  const mentionId = action.action_id.replace('ignore_reply_', '');
  const pending = pendingReplies.get(mentionId);

  if (!pending) {
    return; // Already handled or expired
  }

  try {
    // Update the Slack message to show it was ignored
    await client.chat.update({
      channel: pending.slackChannel,
      ts: pending.slackTs,
      text: `Ignored mention from @${pending.mention.authorUsername}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `~*Mention from @${pending.mention.authorUsername}*~\n_Ignored_`,
          },
        },
      ],
    });

    // Log the action
    await logActionReceipt(
      'conversation',
      `slack_approval_${mentionId}`,
      'x_reply_ignored',
      `Ignored mention from @${pending.mention.authorUsername}`,
      { mentionId }
    );
  } finally {
    // Clean up pending reply
    pendingReplies.delete(mentionId);
  }
});
