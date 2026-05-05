import { execSync } from 'child_process';
import { config } from '../../config';
import { supabase } from '../../db/client';
import { app } from '../../slack/app';
import { addMessage, getConversationKey } from '../../llm/conversation';
import { getLlmProvider } from '../../llm/provider';
import type { TaskContext } from '../index';

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

// Targeted search queries - quotes matter for relevance
const SEARCH_QUERIES = [
  '"browser game" friends',
  '"browser game" multiplayer',
  '"co-op" "browser game"',
  '"online game" "play with friends"',
  'subreddit:gamingsuggestions browser',
  'subreddit:gamingsuggestions "play with friends"',
  'subreddit:gamingsuggestions multiplayer online',
  'subreddit:WebGames multiplayer',
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

// Reddit search with a query
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
  const llm = getLlmProvider('quizScanner');
  const prompt = `You are helping find marketing opportunities for Quizio (quizio.io), a free multiplayer browser game where players compete to name countries, US states, capitals, etc. on a map. Great for playing with friends - no download needed.

Analyze this Reddit post and determine if it's a good opportunity to organically mention Quizio:

Title: ${result.title}
URL: ${result.link}
Content: ${result.snippet}

Respond in JSON format:
{
  "relevant": true/false,  // Is this someone ASKING for game recommendations?
  "score": 1-10,           // How good an opportunity (10 = perfect fit asking for exactly this, 1 = not worth it)
  "reason": "...",         // Brief explanation
  "draftResponse": "..."   // If score >= 8, draft a helpful Reddit comment that naturally mentions Quizio. Be casual, not salesy.
}

AUTOMATIC LOW SCORE (1-2) - these are NOT opportunities:
- Someone promoting/sharing their own game or project
- SEO content, guides, articles, or listicles
- Someone sharing a game they found (not asking for recommendations)
- News, announcements, or updates about games
- "Check out my game" or "I made this" posts

Score guide:
- 8-10: Someone ASKING for browser/multiplayer/trivia/geography games to play with friends
- 5-7: Someone asking for general game recommendations where Quizio could fit
- 1-4: Not asking for recommendations, or wrong genre entirely`;

  const response = await llm.generateJson<{
    relevant?: boolean;
    score?: number;
    reason?: string;
    draftResponse?: string;
  }>(prompt, {
    maxTokens: 500,
    taskKey: 'quizScanner',
  });

  await ctx.logUsage(response.usage.inputTokens, response.usage.outputTokens);

  if (!response.data) {
    return {
      result,
      relevant: false,
      score: 0,
      reason: 'Failed to parse LLM response',
      draftResponse: '',
    };
  }

  return {
    result,
    relevant: response.data.relevant ?? false,
    score: response.data.score ?? 0,
    reason: response.data.reason ?? '',
    draftResponse: response.data.draftResponse ?? '',
  };
}

async function sendToSlack(posts: AnalyzedPost[]): Promise<void> {
  const channel = config.slack.notificationChannel;

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

  // Build plain text version for conversation history
  const plainTextParts = [`Found ${posts.length} Quizio opportunities:`];

  for (const post of posts) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${post.result.link}|${post.result.title}>*\nScore: ${post.score}/10 - ${post.reason}\n\n_Draft response:_\n>${post.draftResponse.replace(/\n/g, '\n>')}`,
      },
    });

    blocks.push({ type: 'divider' });

    // Add to plain text for conversation history
    plainTextParts.push(
      `\n${post.result.title}\nURL: ${post.result.link}\nScore: ${post.score}/10 - ${post.reason}\nDraft response: ${post.draftResponse}`
    );
  }

  const response = await app.client.chat.postMessage({
    channel,
    text: `Found ${posts.length} Quizio opportunities`,
    blocks,
  });

  // Save to conversation history so C3P1 remembers what it posted
  if (response.ts) {
    const conversationKey = getConversationKey(response.ts, channel, false);
    await addMessage(conversationKey, 'assistant', plainTextParts.join('\n'));
  }
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

  // Search Reddit with targeted queries
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

  // Step 3: Filter to high-scoring opportunities (score >= 8)
  const goodOpportunities = analyzedPosts.filter(
    (p) => p.relevant && p.score >= 8
  );

  if (goodOpportunities.length > 0) {
    await sendToSlack(goodOpportunities);
    await ctx.logAction('slack_notification', `Sent ${goodOpportunities.length} opportunities to Slack`, {
      count: goodOpportunities.length,
      urls: goodOpportunities.map((p) => p.result.link),
    });
    return `Found ${newPosts.length} posts, ${goodOpportunities.length} good opportunities sent to Slack`;
  }

  return `Found ${newPosts.length} posts, none scored high enough (need >= 8)`;
}
