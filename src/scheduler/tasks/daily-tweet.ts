import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config';
import { getRecentActionReceipts, getRecentApiUsage, getCompletedWorkSince } from '../../db/queries';
import { postTweet, getTwitterClient } from '../../twitter/client';
import type { TaskContext } from '../index';
import type { ActionReceipt, WorkItemWithProject } from '../../db/types';

const claude = new Anthropic({ apiKey: config.anthropic.apiKey });

function formatDate(): string {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

function buildC3P1Report(receipts: ActionReceipt[]): string[] {
  const items: string[] = [];

  // Count action types
  const counts: Record<string, number> = {};
  for (const r of receipts) {
    counts[r.action_type] = (counts[r.action_type] || 0) + 1;
  }

  // Map action types to human-readable items
  if (counts['reddit_search']) {
    items.push(`Ran ${counts['reddit_search']} Reddit searches`);
  }
  if (counts['post_analyzed']) {
    items.push(`Analyzed ${counts['post_analyzed']} posts`);
  }
  if (counts['slack_notification']) {
    items.push(`Sent ${counts['slack_notification']} Slack notification(s)`);
  }
  if (counts['tweet_posted']) {
    items.push(`Posted ${counts['tweet_posted']} tweet(s)`);
  }

  return items;
}

function groupWorkByProject(workItems: WorkItemWithProject[]): Record<string, string[]> {
  const byProject: Record<string, string[]> = {};

  for (const item of workItems) {
    const slug = item.project?.slug || 'unknown';
    if (!byProject[slug]) {
      byProject[slug] = [];
    }
    const summary = item.completed_summary || item.summary;
    byProject[slug].push(summary);
  }

  return byProject;
}

async function summarizeAlanWork(
  byProject: Record<string, string[]>,
  ctx: TaskContext
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const [project, items] of Object.entries(byProject)) {
    if (items.length === 1 && items[0].length <= 25) {
      // Short enough already
      result[project] = items[0];
    } else {
      // Use Claude to summarize
      const prompt = `Summarize this work in 20 characters or less for a tweet. Be concise, no fluff.

Project: ${project}
Work items:
${items.map(i => `- ${i}`).join('\n')}

Reply with ONLY the summary, no quotes.`;

      const response = await claude.messages.create({
        model: config.anthropic.model,
        max_tokens: 30,
        messages: [{ role: 'user', content: prompt }],
      });

      await ctx.logUsage(response.usage.input_tokens, response.usage.output_tokens);

      const summary = response.content[0].type === 'text'
        ? response.content[0].text.trim().slice(0, 25)
        : `${items.length} items`;

      result[project] = summary;
    }
  }

  return result;
}

function buildTweetText(
  c3p1Items: string[],
  alanWork: Record<string, string>,
  cost: number
): string {
  const date = formatDate();
  let tweet = `📊 ${date} Report\n\n`;

  // C-3P1 section
  if (c3p1Items.length > 0) {
    tweet += `🤖 Things I did:\n`;
    for (const item of c3p1Items.slice(0, 3)) {
      tweet += `✓ ${item}\n`;
    }
    tweet += `\n`;
  }

  // Alan section
  const projects = Object.keys(alanWork);
  if (projects.length > 0) {
    tweet += `👤 Things Alan did:\n`;
    for (const project of projects.slice(0, 3)) {
      tweet += `${project}: ${alanWork[project]}\n`;
    }
    tweet += `\n`;
  }

  // If nothing happened
  if (c3p1Items.length === 0 && projects.length === 0) {
    tweet += `No activity today.\n\n`;
  }

  tweet += `💰 API: $${cost.toFixed(2)}`;
  tweet += `\n\n#buildinpublic`;

  return tweet;
}

export async function runDailyTweet(ctx: TaskContext): Promise<string> {
  // Check if Twitter is configured
  if (!getTwitterClient()) {
    await ctx.logAction('twitter_skipped', 'Twitter credentials not configured');
    return 'Skipped: Twitter credentials not configured';
  }

  // Get C-3P1 activity from last 24 hours
  const receipts = await getRecentActionReceipts(24);
  await ctx.logAction('activity_fetched', `Found ${receipts.length} actions in last 24h`, {
    count: receipts.length,
  });

  // Get Alan's completed work from last 24 hours
  const workItems = await getCompletedWorkSince(24);

  // Get API costs
  const usage = await getRecentApiUsage(24);

  // Build report
  const c3p1Items = buildC3P1Report(receipts);
  const workByProject = groupWorkByProject(workItems);
  const alanWork = await summarizeAlanWork(workByProject, ctx);
  const tweetText = buildTweetText(c3p1Items, alanWork, usage.cost);

  await ctx.logAction('tweet_generated', `Generated: ${tweetText.slice(0, 50)}...`, {
    length: tweetText.length,
    fullText: tweetText,
  });

  // Check length
  if (tweetText.length > 280) {
    await ctx.logAction('tweet_failed', `Tweet too long: ${tweetText.length} chars`);
    return `Failed: Tweet too long (${tweetText.length} chars)`;
  }

  // Post to Twitter
  const result = await postTweet(tweetText);

  if (result.success) {
    await ctx.logAction('tweet_posted', `Posted tweet: ${result.tweetId}`, {
      tweetId: result.tweetId,
      text: tweetText,
    });
    return `Tweeted: "${tweetText.slice(0, 50)}..." (ID: ${result.tweetId})`;
  } else {
    await ctx.logAction('tweet_failed', `Failed: ${result.error}`, {
      error: result.error,
      attemptedText: tweetText,
    });
    return `Failed to tweet: ${result.error}`;
  }
}
