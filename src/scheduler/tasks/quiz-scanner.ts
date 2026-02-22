import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import { config } from '../../config';
import { supabase } from '../../db/client';
import { app } from '../../slack/app';
import type { TaskContext } from '../index';

const claude = new Anthropic({ apiKey: config.anthropic.apiKey });

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface RedditPost {
  kind: string;
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    subreddit: string;
    author: string;
    created_utc: number;
  };
}

interface RedditResponse {
  data: {
    children: RedditPost[];
  };
}

interface AnalyzedPost {
  result: SearchResult;
  relevant: boolean;
  score: number; // 1-10, how good an opportunity
  reason: string;
  draftResponse: string;
}

// Subreddits to monitor for new posts (recommendation-focused)
const SUBREDDITS_TO_MONITOR = [
  'gamingsuggestions',
  'ShouldIbuythisgame',
  'CoOpGaming',
  'boardgames',
  'gamesuggestions',
  'IndianGaming',
  'GamerPals',
];

// Search queries for broader Reddit search
const SEARCH_QUERIES = [
  'looking for multiplayer game',
  'recommend geography quiz',
  'trivia game friends',
  'looking for quiz game',
];

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function fetchRedditJson(url: string): RedditResponse {
  // Use curl to bypass Reddit's TLS fingerprinting that blocks Node.js fetch
  const json = execSync(`curl -s -A "${USER_AGENT}" "${url}"`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
  });
  return JSON.parse(json) as RedditResponse;
}

function parseRedditPosts(response: RedditResponse): SearchResult[] {
  if (!response.data?.children) {
    return [];
  }

  // Filter for posts only (t3_), not comments or other types
  const posts = response.data.children.filter((child) => child.kind === 't3');

  return posts.map((post) => ({
    title: post.data.title,
    link: `https://www.reddit.com${post.data.permalink}`,
    snippet: post.data.selftext.slice(0, 300) || post.data.title,
  }));
}

// Search within a specific subreddit for new posts
async function searchSubreddit(subreddit: string): Promise<SearchResult[]> {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=25`;
  const response = fetchRedditJson(url);
  return parseRedditPosts(response);
}

// Broad Reddit search with a query
async function searchReddit(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    sort: 'new',
    t: 'week',
    type: 'link',
    limit: '25',
  });

  const url = `https://www.reddit.com/search.json?${params}`;
  const response = fetchRedditJson(url);
  return parseRedditPosts(response);
}

async function isPostSeen(platform: string, postUrl: string): Promise<boolean> {
  const { data } = await supabase
    .from('seen_posts')
    .select('id')
    .eq('platform', platform)
    .eq('post_url', postUrl)
    .single();

  return !!data;
}

async function markPostSeen(
  platform: string,
  postId: string,
  postUrl: string,
  title: string
): Promise<void> {
  await supabase.from('seen_posts').insert({
    platform,
    post_id: postId,
    post_url: postUrl,
    title,
    notified: true,
  });
}

function extractPlatform(url: string): string {
  if (url.includes('reddit.com')) return 'reddit';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  return 'other';
}

function extractPostId(url: string): string {
  // Simple hash of URL as ID
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function analyzePost(
  result: SearchResult,
  ctx: TaskContext
): Promise<AnalyzedPost> {
  const prompt = `You are helping find marketing opportunities for Quizio (quizio.io), a geography quiz game where players name all countries, US states, etc.

Analyze this search result and determine if it's a good opportunity to organically mention Quizio:

Title: ${result.title}
URL: ${result.link}
Snippet: ${result.snippet}

Respond in JSON format:
{
  "relevant": true/false,  // Is this actually about geography/country naming games?
  "score": 1-10,           // How good an opportunity (10 = perfect fit, 1 = not worth it)
  "reason": "...",         // Brief explanation
  "draftResponse": "..."   // If score >= 6, draft a helpful, non-spammy response that naturally mentions Quizio
}

Guidelines for responses:
- Be helpful first, promotional second
- Don't be pushy or spammy
- Only mention Quizio if it genuinely fits the conversation
- Keep it casual and authentic`;

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  // Log API usage
  await ctx.logUsage(response.usage.input_tokens, response.usage.output_tokens);

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      result,
      relevant: parsed.relevant ?? false,
      score: parsed.score ?? 0,
      reason: parsed.reason ?? '',
      draftResponse: parsed.draftResponse ?? '',
    };
  } catch {
    return {
      result,
      relevant: false,
      score: 0,
      reason: 'Failed to parse LLM response',
      draftResponse: '',
    };
  }
}

async function sendToSlack(posts: AnalyzedPost[]): Promise<void> {
  const channel = 'C0AFW2TSTF1';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔍 Found ${posts.length} Quizio opportunities:*`,
      },
    },
  ];

  for (const post of posts) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${post.result.link}|${post.result.title}>*\nScore: ${post.score}/10 - ${post.reason}\n\n_Draft response:_\n>${post.draftResponse.replace(/\n/g, '\n>')}`,
      },
    });

    blocks.push({ type: 'divider' });
  }

  await app.client.chat.postMessage({
    channel,
    text: `Found ${posts.length} Quizio opportunities`,
    blocks,
  });
}

export async function runQuizScanner(ctx: TaskContext): Promise<string> {
  const newPosts: SearchResult[] = [];
  const seenUrls = new Set<string>(); // Dedupe across sources

  // Helper to process results from any source
  async function processResults(results: SearchResult[], source: string): Promise<void> {
    for (const result of results) {
      // Skip if we've already seen this URL in this run
      if (seenUrls.has(result.link)) continue;
      seenUrls.add(result.link);

      const platform = extractPlatform(result.link);
      const seen = await isPostSeen(platform, result.link);

      if (!seen) {
        newPosts.push(result);
        await markPostSeen(
          platform,
          extractPostId(result.link),
          result.link,
          result.title
        );
      }
    }
  }

  // Step 1a: Monitor subreddits for new posts
  for (const subreddit of SUBREDDITS_TO_MONITOR) {
    try {
      await ctx.logAction('subreddit_scan', `Scanning r/${subreddit}`, { subreddit });
      const results = await searchSubreddit(subreddit);
      await processResults(results, `r/${subreddit}`);

      // Small delay between requests to be nice
      await new Promise((r) => setTimeout(r, 300));
    } catch (error) {
      console.error(`[QUIZ_SCANNER] Error scanning r/${subreddit}:`, error);
    }
  }

  // Step 1b: Broad search with queries
  for (const query of SEARCH_QUERIES) {
    try {
      await ctx.logAction('reddit_search', `Searching Reddit: "${query}"`, { query });
      const results = await searchReddit(query);
      await processResults(results, `search: ${query}`);

      // Small delay between queries
      await new Promise((r) => setTimeout(r, 300));
    } catch (error) {
      console.error(`[QUIZ_SCANNER] Error searching "${query}":`, error);
    }
  }

  await ctx.logAction('posts_found', `Found ${newPosts.length} new posts`, {
    count: newPosts.length,
  });

  if (newPosts.length === 0) {
    return 'No new posts found';
  }

  console.log(`[QUIZ_SCANNER] Found ${newPosts.length} new posts, analyzing...`);

  // Step 2: Analyze each post with Claude
  const analyzedPosts: AnalyzedPost[] = [];
  for (const post of newPosts) {
    try {
      const analyzed = await analyzePost(post, ctx);
      analyzedPosts.push(analyzed);

      await ctx.logAction('post_analyzed', `Analyzed: ${post.title.slice(0, 50)}...`, {
        url: post.link,
        score: analyzed.score,
        relevant: analyzed.relevant,
      });

      console.log(
        `[QUIZ_SCANNER] ${post.title.slice(0, 50)}... → score: ${analyzed.score}`
      );
    } catch (error) {
      console.error(`[QUIZ_SCANNER] Error analyzing post:`, error);
    }
  }

  // Step 3: Filter to high-scoring opportunities (score >= 6)
  const goodOpportunities = analyzedPosts.filter(
    (p) => p.relevant && p.score >= 6
  );

  if (goodOpportunities.length > 0) {
    await sendToSlack(goodOpportunities);
    await ctx.logAction('slack_notification', `Sent ${goodOpportunities.length} opportunities to Slack`, {
      count: goodOpportunities.length,
      urls: goodOpportunities.map((p) => p.result.link),
    });
    return `Found ${newPosts.length} posts, ${goodOpportunities.length} good opportunities sent to Slack`;
  }

  return `Found ${newPosts.length} posts, none scored high enough (need >= 6)`;
}
