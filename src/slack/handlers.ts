import { app } from './app';
import { generateResponse } from '../llm/client';
import { addMessage, getHistory } from '../llm/conversation';

// Handle direct messages
app.message(async ({ message, say, client }) => {
  // Only respond to actual user messages (not bot messages, not edits)
  if (message.subtype || !('text' in message) || !message.text) {
    return;
  }

  const userId = message.user;
  const userMessage = message.text;
  const channel = message.channel;

  try {
    // Show typing indicator
    await client.chat.postMessage({
      channel,
      text: '_Processing..._',
    }).then(async (result) => {
      // Add user message to history
      addMessage(userId, 'user', userMessage);

      // Generate response
      const history = getHistory(userId);
      const response = await generateResponse(history);

      // Add assistant response to history
      addMessage(userId, 'assistant', response);

      // Update the "Processing..." message with actual response
      await client.chat.update({
        channel,
        ts: result.ts!,
        text: response,
      });
    });
  } catch (error) {
    console.error('Error handling message:', error);
    await say('I apologize, sir. I seem to have encountered a technical difficulty. Perhaps we might try again?');
  }
});

// Handle @mentions in channels
app.event('app_mention', async ({ event, say, client }) => {
  const userId = event.user;
  if (!userId) {
    return;
  }

  // Remove the @mention from the message
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const channel = event.channel;

  if (!userMessage) {
    await say('Yes, sir? How may I assist you?');
    return;
  }

  try {
    // Show typing indicator
    await client.chat.postMessage({
      channel,
      text: '_Processing..._',
    }).then(async (result) => {
      // Add user message to history
      addMessage(userId, 'user', userMessage);

      // Generate response
      const history = getHistory(userId);
      const response = await generateResponse(history);

      // Add assistant response to history
      addMessage(userId, 'assistant', response);

      // Update the message with actual response
      await client.chat.update({
        channel,
        ts: result.ts!,
        text: response,
      });
    });
  } catch (error) {
    console.error('Error handling mention:', error);
    await say('I apologize, sir. I seem to have encountered a technical difficulty.');
  }
});
