import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config';

let twitterClient: TwitterApi | null = null;

export function getTwitterClient(): TwitterApi | null {
  if (!config.twitter.apiKey || !config.twitter.accessToken) {
    return null;
  }

  if (!twitterClient) {
    twitterClient = new TwitterApi({
      appKey: config.twitter.apiKey,
      appSecret: config.twitter.apiKeySecret!,
      accessToken: config.twitter.accessToken,
      accessSecret: config.twitter.accessTokenSecret!,
    });
  }

  return twitterClient;
}

export interface TweetResult {
  success: boolean;
  tweetId?: string;
  error?: string;
}

export async function postTweet(text: string): Promise<TweetResult> {
  const client = getTwitterClient();

  if (!client) {
    return {
      success: false,
      error: 'Twitter credentials not configured',
    };
  }

  if (text.length > 280) {
    return {
      success: false,
      error: `Tweet exceeds 280 characters (${text.length})`,
    };
  }

  try {
    const result = await client.v2.tweet(text);
    return {
      success: true,
      tweetId: result.data.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

export interface Mention {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  createdAt: string;
  conversationId: string;
  inReplyToUserId?: string;
}

export interface MentionsResult {
  success: boolean;
  mentions?: Mention[];
  error?: string;
}

export async function getMentions(sinceId?: string): Promise<MentionsResult> {
  const client = getTwitterClient();

  if (!client) {
    return {
      success: false,
      error: 'Twitter credentials not configured',
    };
  }

  try {
    // Get authenticated user's ID
    const me = await client.v2.me();
    const userId = me.data.id;

    // Fetch mentions timeline
    const mentions = await client.v2.userMentionTimeline(userId, {
      max_results: 100,
      'tweet.fields': ['created_at', 'conversation_id', 'in_reply_to_user_id', 'author_id'],
      'user.fields': ['username', 'name'],
      expansions: ['author_id'],
      ...(sinceId && { since_id: sinceId }),
    });

    // Build a map of user IDs to user info
    const userMap = new Map<string, { username: string; name: string }>();
    if (mentions.includes?.users) {
      for (const user of mentions.includes.users) {
        userMap.set(user.id, { username: user.username, name: user.name });
      }
    }

    const result: Mention[] = [];
    for (const tweet of mentions.data?.data || []) {
      const author = userMap.get(tweet.author_id || '');
      result.push({
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id || '',
        authorUsername: author?.username || 'unknown',
        authorName: author?.name || 'Unknown',
        createdAt: tweet.created_at || new Date().toISOString(),
        conversationId: tweet.conversation_id || tweet.id,
        inReplyToUserId: tweet.in_reply_to_user_id,
      });
    }

    return {
      success: true,
      mentions: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

export async function postTweetWithMedia(
  text: string,
  imageBuffer: Buffer
): Promise<TweetResult> {
  const client = getTwitterClient();

  if (!client) {
    return {
      success: false,
      error: 'Twitter credentials not configured',
    };
  }

  try {
    // Upload media using v1 API (required for media uploads)
    const mediaId = await client.v1.uploadMedia(imageBuffer, {
      mimeType: 'image/png',
    });

    // Post tweet with media using v2 API
    const result = await client.v2.tweet({
      text,
      media: {
        media_ids: [mediaId],
      },
    });

    return {
      success: true,
      tweetId: result.data.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

export interface Tweet {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  createdAt: string;
  conversationId: string;
}

export interface TweetLookupResult {
  success: boolean;
  tweet?: Tweet;
  error?: string;
}

export async function getTweetById(tweetId: string): Promise<TweetLookupResult> {
  const client = getTwitterClient();

  if (!client) {
    return {
      success: false,
      error: 'Twitter credentials not configured',
    };
  }

  try {
    const result = await client.v2.singleTweet(tweetId, {
      'tweet.fields': ['created_at', 'conversation_id', 'author_id'],
      'user.fields': ['username', 'name'],
      expansions: ['author_id'],
    });

    const author = result.includes?.users?.[0];

    return {
      success: true,
      tweet: {
        id: result.data.id,
        text: result.data.text,
        authorId: result.data.author_id || '',
        authorUsername: author?.username || 'unknown',
        authorName: author?.name || 'Unknown',
        createdAt: result.data.created_at || new Date().toISOString(),
        conversationId: result.data.conversation_id || result.data.id,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

export async function replyToTweet(
  replyToId: string,
  text: string
): Promise<TweetResult> {
  const client = getTwitterClient();

  if (!client) {
    return {
      success: false,
      error: 'Twitter credentials not configured',
    };
  }

  if (text.length > 280) {
    return {
      success: false,
      error: `Tweet exceeds 280 characters (${text.length})`,
    };
  }

  try {
    const result = await client.v2.tweet({
      text,
      reply: {
        in_reply_to_tweet_id: replyToId,
      },
    });

    return {
      success: true,
      tweetId: result.data.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
