import Anthropic from '@anthropic-ai/sdk';
import '../src/config';
import { config } from '../src/config';
import { getRecentActionReceipts, getRecentApiUsage, getCompletedWorkSince } from '../src/db/queries';
import type { ActionReceipt, WorkItemWithProject } from '../src/db/types';

const claude = new Anthropic({ apiKey: config.anthropic.apiKey });

function formatDate(): string {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

function buildC3P1Report(receipts: ActionReceipt[]): string[] {
  const items: string[] = [];
  const counts: Record<string, number> = {};
  for (const r of receipts) {
    counts[r.action_type] = (counts[r.action_type] || 0) + 1;
  }

  if (counts['reddit_search']) items.push(`Ran ${counts['reddit_search']} Reddit searches`);
  if (counts['post_analyzed']) items.push(`Analyzed ${counts['post_analyzed']} posts`);
  if (counts['slack_notification']) items.push(`Sent ${counts['slack_notification']} Slack notification(s)`);
  if (counts['tweet_posted']) items.push(`Posted ${counts['tweet_posted']} tweet(s)`);

  return items;
}

function groupWorkByProject(workItems: WorkItemWithProject[]): Record<string, string[]> {
  const byProject: Record<string, string[]> = {};
  for (const item of workItems) {
    const slug = item.project?.slug || 'unknown';
    if (!byProject[slug]) byProject[slug] = [];
    const summary = item.completed_summary || item.summary;
    byProject[slug].push(summary);
  }
  return byProject;
}

async function summarizeAlanWork(byProject: Record<string, string[]>): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const [project, items] of Object.entries(byProject)) {
    if (items.length === 1 && items[0].length <= 25) {
      result[project] = items[0];
    } else {
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

      const summary = response.content[0].type === 'text'
        ? response.content[0].text.trim().slice(0, 25)
        : `${items.length} items`;

      result[project] = summary;
    }
  }

  return result;
}

function buildTweetText(c3p1Items: string[], alanWork: Record<string, string>, cost: number): string {
  const date = formatDate();
  let tweet = `📊 ${date} Report\n\n`;

  if (c3p1Items.length > 0) {
    tweet += `🤖 Things I did:\n`;
    for (const item of c3p1Items.slice(0, 3)) {
      tweet += `✓ ${item}\n`;
    }
    tweet += `\n`;
  }

  const projects = Object.keys(alanWork);
  if (projects.length > 0) {
    tweet += `👤 Things Alan did:\n`;
    for (const project of projects.slice(0, 3)) {
      tweet += `${project}: ${alanWork[project]}\n`;
    }
    tweet += `\n`;
  }

  if (c3p1Items.length === 0 && projects.length === 0) {
    tweet += `No activity today.\n\n`;
  }

  tweet += `💰 API: $${cost.toFixed(2)}`;
  tweet += `\n\n#buildinpublic`;

  return tweet;
}

async function main() {
  const receipts = await getRecentActionReceipts(24);
  const workItems = await getCompletedWorkSince(24);
  const usage = await getRecentApiUsage(24);

  const c3p1Items = buildC3P1Report(receipts);
  const workByProject = groupWorkByProject(workItems);
  const alanWork = await summarizeAlanWork(workByProject);
  const tweet = buildTweetText(c3p1Items, alanWork, usage.cost);

  console.log(`\n--- PREVIEW (${tweet.length} chars) ---\n`);
  console.log(tweet);
  console.log(`\n--- END PREVIEW ---`);

  console.log(`\nDebug info:`);
  console.log(`- Action receipts: ${receipts.length}`);
  console.log(`- Work items completed: ${workItems.length}`);
  console.log(`- API cost: $${usage.cost.toFixed(4)}`);
}

main();
