import { config } from '../../config';
import { supabase } from '../../db/client';
import { app } from '../../slack/app';
import { generateResponse } from '../../llm/client';
import { getMentions, getTweetById, getTwitterClient, type Mention } from '../../twitter/client';
import type { TaskContext } from '../index';

// In-memory store for pending reply approvals
// Key: mention ID, Value: { mention, originalTweet, draftReply }
interface PendingReply {
  mention: Mention;
  originalTweetText: string | null;
  draftReply: string;
  slackTs: string;
  slackChannel: string;
}

export const pendingReplies = new Map<string, PendingReply>();

async function isMentionSeen(mentionId: string): Promise<boolean> {
  const { data } = await supabase
    .from('seen_posts')
    .select('id')
    .eq('platform', 'twitter_mention')
    .eq('post_id', mentionId)
    .single();

  return !!data;
}

async function markMentionSeen(mention: Mention): Promise<void> {
  await supabase.from('seen_posts').insert({
    platform: 'twitter_mention',
    post_id: mention.id,
    post_url: `https://twitter.com/${mention.authorUsername}/status/${mention.id}`,
    title: mention.text.slice(0, 200),
    author: mention.authorUsername,
    notified: true,
  });
}

async function generateReplyDraft(
  mention: Mention,
  originalTweetText: string | null
): Promise<string> {
  // Build the context message for C-3P1
  const contextParts = [
    `You received this mention on X from @${mention.authorUsername}:`,
    `"${mention.text}"`,
  ];

  if (originalTweetText) {
    contextParts.push(
      ``,
      `This is a reply to your tweet:`,
      `"${originalTweetText}"`
    );
  }

  contextParts.push(
    ``,
    `Investigate if this relates to any recent work or actions you've taken. Use query_database to check:`,
    `- Recent completed work items (works table, status='completed', last 48 hours)`,
    `- Recent action receipts (action_receipts table, last 48 hours)`,
    ``,
    `Then draft a brief reply (max 280 chars) in your voice. Be helpful and contextual.`,
    `If you find relevant context, reference it naturally.`,
    ``,
    `IMPORTANT: Your final response should be ONLY the reply text - no explanation or preamble.`
  );

  const history = [{ role: 'user' as const, content: contextParts.join('\n') }];

  // Use the existing agentic loop - C-3P1 will investigate and draft
  const response = await generateResponse(history);

  return response;
}

async function sendForApproval(
  mention: Mention,
  originalTweetText: string | null,
  draftReply: string
): Promise<void> {
  const channel = config.slack.notificationChannel;
  const tweetUrl = `https://twitter.com/${mention.authorUsername}/status/${mention.id}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*New X mention from @${mention.authorUsername}:*\n>${mention.text.replace(/\n/g, '\n>')}`,
      },
    },
  ];

  if (originalTweetText) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Replying to your tweet: "${originalTweetText.slice(0, 100)}${originalTweetText.length > 100 ? '...' : ''}"_`,
        },
      ],
    });
  }

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Draft reply:*\n${draftReply}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${draftReply.length}/280 characters | <${tweetUrl}|View on X>`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve & Reply' },
          style: 'primary',
          action_id: `approve_reply_${mention.id}`,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Ignore' },
          action_id: `ignore_reply_${mention.id}`,
        },
      ],
    }
  );

  const response = await app.client.chat.postMessage({
    channel,
    text: `New X mention from @${mention.authorUsername} - draft reply ready for approval`,
    blocks,
  });

  // Store pending reply for when button is clicked
  if (response.ts) {
    pendingReplies.set(mention.id, {
      mention,
      originalTweetText,
      draftReply,
      slackTs: response.ts,
      slackChannel: channel,
    });
  }
}

export async function runTwitterMentions(ctx: TaskContext): Promise<string> {
  // Check if Twitter is configured
  if (!getTwitterClient()) {
    await ctx.logAction('twitter_skipped', 'Twitter not configured');
    return 'Skipped: Twitter not configured';
  }

  await ctx.logAction('mentions_fetch_start', 'Fetching mentions from X');

  // Fetch recent mentions
  const result = await getMentions();

  if (!result.success) {
    await ctx.logAction('mentions_fetch_failed', `Failed: ${result.error}`, {
      error: result.error,
    });
    return `Failed to fetch mentions: ${result.error}`;
  }

  const mentions = result.mentions || [];
  await ctx.logAction('mentions_fetched', `Fetched ${mentions.length} mentions`, {
    count: mentions.length,
  });

  if (mentions.length === 0) {
    return 'No mentions found';
  }

  // Filter to only new mentions
  const newMentions: Mention[] = [];
  for (const mention of mentions) {
    const seen = await isMentionSeen(mention.id);
    if (!seen) {
      newMentions.push(mention);
      await markMentionSeen(mention);
    }
  }

  await ctx.logAction('mentions_filtered', `Found ${newMentions.length} new mentions`, {
    total: mentions.length,
    new: newMentions.length,
  });

  if (newMentions.length === 0) {
    return `Checked ${mentions.length} mentions, all already seen`;
  }

  // Process each new mention
  let draftsGenerated = 0;
  for (const mention of newMentions) {
    try {
      // Get the original tweet if this is a reply to one of our tweets
      let originalTweetText: string | null = null;
      if (mention.conversationId !== mention.id) {
        // This is a reply - fetch the conversation root
        const originalResult = await getTweetById(mention.conversationId);
        if (originalResult.success && originalResult.tweet) {
          originalTweetText = originalResult.tweet.text;
        }
      }

      await ctx.logAction('generating_reply', `Generating reply for @${mention.authorUsername}`, {
        mentionId: mention.id,
        hasOriginalContext: !!originalTweetText,
      });

      // Generate draft reply using agentic loop
      const draftReply = await generateReplyDraft(mention, originalTweetText);

      // Send to Slack for approval
      await sendForApproval(mention, originalTweetText, draftReply);

      await ctx.logAction('draft_sent_for_approval', `Draft reply sent for @${mention.authorUsername}`, {
        mentionId: mention.id,
        draftLength: draftReply.length,
      });

      draftsGenerated++;
    } catch (error) {
      console.error(`[TWITTER_MENTIONS] Error processing mention ${mention.id}:`, error);
      await ctx.logAction('mention_error', `Error processing mention from @${mention.authorUsername}`, {
        mentionId: mention.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return `Processed ${newMentions.length} new mention(s), ${draftsGenerated} draft(s) sent for approval`;
}
