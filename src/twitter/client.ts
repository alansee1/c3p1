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
