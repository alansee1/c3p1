import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import { config } from '../../config';
import { supabase } from '../../db/client';
import { app } from '../../slack/app';
import { addMessage, getConversationKey } from '../../llm/conversation';
import type { TaskContext } from '../index';

const claude = new Anthropic({ apiKey: config.anthropic.apiKey });

// How many days before we can suggest the same quiz again
const SUGGESTION_COOLDOWN_DAYS = 120;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// Normalize quiz name for deduplication (lowercase, trim)
function normalizeQuizName(name: string): string {
  return name.toLowerCase().trim();
}

// Get recently suggested quiz names to avoid repeats
async function getRecentSuggestions(): Promise<string[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SUGGESTION_COOLDOWN_DAYS);

  const { data } = await supabase
    .from('suggested_quizzes')
    .select('quiz_name')
    .gte('suggested_at', cutoffDate.toISOString());

  return (data || []).map(row => row.quiz_name);
}

// Save a quiz suggestion to the database
async function saveSuggestion(quizName: string, hook: string): Promise<void> {
  const normalized = normalizeQuizName(quizName);

  await supabase
    .from('suggested_quizzes')
    .upsert(
      { quiz_name: normalized, hook, suggested_at: new Date().toISOString() },
      { onConflict: 'quiz_name' }
    );
}

interface WikiPage {
  title: string;
  content: string;
}

interface QuizIdea {
  quizName: string;
  hook: string;
  quizType: string;
  itemCount: string;
  dataSource: string;
  action: string;
  emoji: string;
}

// Pages to check for upcoming events (dynamic based on current date)
function getEventPages(): string[] {
  const now = new Date();
  const year = now.getFullYear();

  return [
    `${year}_in_sports`,
    `${year}_in_film`,
    `${year}_NFL_draft`,
    `${year}_NBA_playoffs`,
    `${year}_FIFA_World_Cup`,
    `${year}_in_association_football`,
  ];
}

function fetchWikipediaPage(title: string): WikiPage | null {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json&rvslots=main&rvsection=0`;

    const json = execSync(`curl -s -A "${USER_AGENT}" "${url}"`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    const data = JSON.parse(json);
    const pages = data.query?.pages;
    if (!pages) return null;

    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') return null; // Page doesn't exist

    const content = pages[pageId]?.revisions?.[0]?.slots?.main?.['*'] || '';
    return {
      title: pages[pageId].title,
      content: content.slice(0, 3000), // Limit content size
    };
  } catch (error) {
    console.error(`[QUIZ_IDEAS] Error fetching ${title}:`, error);
    return null;
  }
}

async function generateQuizIdeas(
  pages: WikiPage[],
  recentSuggestions: string[],
  ctx: TaskContext
): Promise<QuizIdea[]> {
  const eventsText = pages
    .map(p => `=== ${p.title} ===\n${p.content}`)
    .join('\n\n');

  const avoidText = recentSuggestions.length > 0
    ? `\n\nAVOID THESE (already suggested recently):\n${recentSuggestions.map(s => `- ${s}`).join('\n')}`
    : '';

  const prompt = `You are helping generate EVERGREEN quiz ideas for Quizio, a multiplayer trivia game. These quizzes should be timed to upcoming events for SEO.

KEY PRINCIPLE: The event is the SEO hook. The quiz should be timeless/historical.
- BAD: "2026 NFL Draft First Round Picks" (only relevant for days)
- GOOD: "#1 NFL Draft Picks All-Time" (evergreen, updated yearly)

Given these upcoming events from Wikipedia, suggest 3-5 evergreen quizzes that:
1. Will get search traffic when the event trends
2. Are historical/all-time lists (not single-year)
3. Have 30-100 items ideally (not too easy, not impossible)
4. Data is publicly available on Wikipedia

EVENTS DATA:
${eventsText}

Respond in JSON format:
{
  "ideas": [
    {
      "quizName": "NBA Finals Winners",
      "hook": "NBA Playoffs start Apr 18",
      "quizType": "simple-grid or sprite-grid or svg-map or photo-reveal",
      "itemCount": "~75 teams",
      "dataSource": "Wikipedia: List of NBA champions",
      "action": "Build now",
      "emoji": "🏀"
    }
  ]
}
${avoidText}

IMPORTANT: Always include the specific date in the "hook" field (e.g., "Apr 18" or "June 11-July 19").

Focus on events happening in the next 1-4 months. Prioritize sports, entertainment, and cultural events that drive significant search traffic.`;

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  await ctx.logUsage(response.usage.input_tokens, response.usage.output_tokens);

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.ideas || [];
  } catch {
    console.error('[QUIZ_IDEAS] Failed to parse LLM response:', text);
    return [];
  }
}

async function sendToSlack(ideas: QuizIdea[], pagesChecked: number): Promise<void> {
  const channel = config.slack.notificationChannel;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Build blocks for Slack
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📊 Weekly Quiz Ideas (${dateStr})*\n\nUpcoming events → Evergreen quiz opportunities:`,
      },
    },
    { type: 'divider' },
  ];

  // Build plain text for conversation history
  const plainTextParts = [`Weekly Quiz Ideas (${dateStr}):\n`];

  ideas.forEach((idea, i) => {
    const text = `*${i + 1}. ${idea.emoji} ${idea.quizName}*\n` +
      `Hook: ${idea.hook}\n` +
      `Type: ${idea.quizType} | ${idea.itemCount}\n` +
      `Data: ${idea.dataSource}\n` +
      `Action: ${idea.action}`;

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text },
    });

    plainTextParts.push(
      `${i + 1}. ${idea.quizName}\n` +
      `   Hook: ${idea.hook}\n` +
      `   Type: ${idea.quizType} | ${idea.itemCount}\n` +
      `   Data: ${idea.dataSource}\n` +
      `   Action: ${idea.action}\n`
    );
  });

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `_Checked ${pagesChecked} Wikipedia pages. Reply in thread to discuss!_`,
      },
    ],
  });

  const response = await app.client.chat.postMessage({
    channel,
    text: `Weekly Quiz Ideas: ${ideas.length} suggestions`,
    blocks,
  });

  // Save to conversation history so C3P1 remembers what it posted
  if (response.ts) {
    const conversationKey = getConversationKey(response.ts, channel, false);
    await addMessage(conversationKey, 'assistant', plainTextParts.join('\n'));
  }
}

export async function runQuizIdeasScanner(ctx: TaskContext): Promise<string> {
  const pageTitles = getEventPages();
  const pages: WikiPage[] = [];

  // Fetch Wikipedia pages
  for (const title of pageTitles) {
    await ctx.logAction('wiki_fetch', `Fetching Wikipedia: ${title}`, { title });
    const page = fetchWikipediaPage(title);
    if (page) {
      pages.push(page);
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 200));
  }

  await ctx.logAction('pages_fetched', `Fetched ${pages.length} Wikipedia pages`, {
    count: pages.length,
    titles: pages.map(p => p.title),
  });

  if (pages.length === 0) {
    return 'No Wikipedia pages could be fetched';
  }

  // Get recently suggested quizzes to avoid repeats
  const recentSuggestions = await getRecentSuggestions();
  await ctx.logAction('checked_recent', `Found ${recentSuggestions.length} recent suggestions to avoid`, {
    count: recentSuggestions.length,
  });

  // Generate quiz ideas with Claude
  const ideas = await generateQuizIdeas(pages, recentSuggestions, ctx);

  await ctx.logAction('ideas_generated', `Generated ${ideas.length} quiz ideas`, {
    count: ideas.length,
    ideas: ideas.map(i => i.quizName),
  });

  if (ideas.length === 0) {
    return 'No quiz ideas generated';
  }

  // Send to Slack
  await sendToSlack(ideas, pages.length);
  await ctx.logAction('slack_notification', `Sent ${ideas.length} quiz ideas to Slack`, {
    count: ideas.length,
  });

  // Save suggestions to database to avoid repeating them
  for (const idea of ideas) {
    await saveSuggestion(idea.quizName, idea.hook);
  }
  await ctx.logAction('suggestions_saved', `Saved ${ideas.length} suggestions to database`, {
    count: ideas.length,
  });

  return `Generated ${ideas.length} quiz ideas from ${pages.length} Wikipedia pages`;
}
