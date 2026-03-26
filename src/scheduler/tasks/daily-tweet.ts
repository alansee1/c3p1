import { getRecentActionReceipts, getRecentApiUsage, getCompletedWorkSince } from '../../db/queries';
import { postTweetWithMedia, getTwitterClient } from '../../twitter/client';
import { generateInfographic, type ReportData } from '../../twitter/infographic';
import type { TaskContext } from '../index';
import type { ActionReceipt, WorkItemWithProject } from '../../db/types';

function formatDate(): string {
  // Report is for yesterday's activity (task runs at midnight)
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

function countActionTypes(receipts: ActionReceipt[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of receipts) {
    counts[r.action_type] = (counts[r.action_type] || 0) + 1;
  }
  return counts;
}

function calculateHoursWorked(workItems: WorkItemWithProject[]): number {
  let totalMs = 0;
  for (const item of workItems) {
    if (item.started_at && item.completed_at) {
      const start = new Date(item.started_at).getTime();
      const end = new Date(item.completed_at).getTime();
      if (end > start) {
        totalMs += end - start;
      }
    }
  }
  return totalMs / (1000 * 60 * 60); // Convert to hours
}

function buildTweetText(): string {
  return `📊 Daily Report - ${formatDate()}\n\n#buildinpublic`;
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

  // Build report data
  const actionCounts = countActionTypes(receipts);
  const itemCount = workItems.length;
  const hoursWorked = calculateHoursWorked(workItems);

  // Group work items by project
  const projectCounts: Record<string, number> = {};
  for (const item of workItems) {
    const slug = item.project?.slug || 'other';
    projectCounts[slug] = (projectCounts[slug] || 0) + 1;
  }
  const projects = Object.entries(projectCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const reportData: ReportData = {
    date: formatDate(),
    actionCounts,
    projects,
    itemCount,
    hoursWorked,
    apiCost: usage.cost,
  };

  const imageBuffer = await generateInfographic(reportData);
  await ctx.logAction('infographic_generated', `Generated infographic (${imageBuffer.length} bytes)`, {
    actionCounts,
    projects,
    itemCount,
    hoursWorked,
    apiCost: usage.cost,
  });

  // Build simple tweet text (details are in the image)
  const tweetText = buildTweetText();

  // Post to Twitter with image
  const result = await postTweetWithMedia(tweetText, imageBuffer);

  if (result.success) {
    await ctx.logAction('tweet_posted', `Posted tweet with infographic: ${result.tweetId}`, {
      tweetId: result.tweetId,
      text: tweetText,
    });
    return `Tweeted with infographic (ID: ${result.tweetId})`;
  } else {
    await ctx.logAction('tweet_failed', `Failed: ${result.error}`, {
      error: result.error,
    });
    return `Failed to tweet: ${result.error}`;
  }
}
