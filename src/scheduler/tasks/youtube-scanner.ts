import { config } from '../../config';
import { supabase } from '../../db/client';
import { app } from '../../slack/app';
import type { TaskContext } from '../index';

// Search terms to find trivia content creators
const SEARCH_QUERIES = ['jetpunk', 'sporcle'];

// Channels to exclude (e.g., official Sporcle channel)
const EXCLUDED_CHANNEL_IDS = [
  'UCmKxZVHqVPVqYxBdMWvuaDg', // Sporcle official
];

// Minimum video views to be considered (low threshold - small creators may be more responsive)
const MIN_VIDEO_VIEWS = 10;

// Max channels to notify per run
const MAX_CHANNELS = 3;

interface YouTubeVideo {
  id: { videoId: string };
  snippet: {
    channelId: string;
    channelTitle: string;
    title: string;
    description: string;
    publishedAt: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
    };
  };
}

interface YouTubeSearchResponse {
  items: YouTubeVideo[];
  pageInfo: { totalResults: number };
}

interface YouTubeChannel {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
    thumbnails: {
      default: { url: string };
    };
  };
  statistics: {
    subscriberCount: string;
    videoCount: string;
    viewCount: string;
  };
}

interface YouTubeChannelsResponse {
  items: YouTubeChannel[];
}

interface YouTubeVideoDetails {
  id: string;
  statistics: {
    viewCount: string;
    likeCount: string;
  };
}

interface YouTubeVideosResponse {
  items: YouTubeVideoDetails[];
}

interface DiscoveredChannel {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  subscriberCount: number;
  videoCount: number;
  triggerVideo: {
    title: string;
    url: string;
    publishedAt: string;
    views: number;
  };
  searchQuery: string;
}

async function searchYouTube(
  query: string,
  apiKey: string
): Promise<YouTubeVideo[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    order: 'date',
    maxResults: '25',
    publishedAfter: getOneWeekAgo(),
    key: apiKey,
  });

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YouTube API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as YouTubeSearchResponse;
  return data.items || [];
}

async function getChannelDetails(
  channelIds: string[],
  apiKey: string
): Promise<Map<string, YouTubeChannel>> {
  if (channelIds.length === 0) return new Map();

  const params = new URLSearchParams({
    part: 'snippet,statistics',
    id: channelIds.join(','),
    key: apiKey,
  });

  const url = `https://www.googleapis.com/youtube/v3/channels?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YouTube API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as YouTubeChannelsResponse;
  const channelMap = new Map<string, YouTubeChannel>();

  for (const channel of data.items || []) {
    channelMap.set(channel.id, channel);
  }

  return channelMap;
}

async function getVideoDetails(
  videoIds: string[],
  apiKey: string
): Promise<Map<string, YouTubeVideoDetails>> {
  if (videoIds.length === 0) return new Map();

  const params = new URLSearchParams({
    part: 'statistics',
    id: videoIds.join(','),
    key: apiKey,
  });

  const url = `https://www.googleapis.com/youtube/v3/videos?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YouTube API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as YouTubeVideosResponse;
  const videoMap = new Map<string, YouTubeVideoDetails>();

  for (const video of data.items || []) {
    videoMap.set(video.id, video);
  }

  return videoMap;
}

function getOneWeekAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

async function isChannelSeen(channelId: string): Promise<boolean> {
  const { data } = await supabase
    .from('seen_posts')
    .select('id')
    .eq('platform', 'youtube_channel')
    .eq('post_id', channelId)
    .single();

  return !!data;
}

async function markChannelSeen(
  channelId: string,
  channelTitle: string,
  channelUrl: string
): Promise<void> {
  await supabase.from('seen_posts').insert({
    platform: 'youtube_channel',
    post_id: channelId,
    post_url: channelUrl,
    title: channelTitle,
    notified: true,
  });
}

async function sendToSlack(channels: DiscoveredChannel[]): Promise<void> {
  const slackChannel = config.slack.notificationChannel;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🎬 Found ${channels.length} new trivia YouTuber${channels.length > 1 ? 's' : ''}:*`,
      },
    },
  ];

  for (const channel of channels) {
    const subCount =
      channel.subscriberCount >= 1000
        ? `${(channel.subscriberCount / 1000).toFixed(1)}K`
        : channel.subscriberCount.toString();

    const viewCount =
      channel.triggerVideo.views >= 1000
        ? `${(channel.triggerVideo.views / 1000).toFixed(1)}K`
        : channel.triggerVideo.views.toString();

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*<${channel.channelUrl}|${channel.channelTitle}>*`,
          `📊 ${subCount} subscribers · ${channel.videoCount} videos`,
          `🔍 Found via: "${channel.searchQuery}"`,
          ``,
          `📹 <${channel.triggerVideo.url}|${channel.triggerVideo.title}> (${viewCount} views)`,
        ].join('\n'),
      },
    });

    blocks.push({ type: 'divider' });
  }

  await app.client.chat.postMessage({
    channel: slackChannel,
    text: `Found ${channels.length} new trivia YouTuber${channels.length > 1 ? 's' : ''}`,
    blocks,
  });
}

export async function runYouTubeScanner(ctx: TaskContext): Promise<string> {
  const apiKey = config.youtube.apiKey;

  if (!apiKey) {
    return 'YouTube API key not configured - skipping';
  }

  // Step 1: Collect all candidate channels from searches
  const candidatesByChannel = new Map<string, { video: YouTubeVideo; query: string }>();

  for (const query of SEARCH_QUERIES) {
    try {
      await ctx.logAction('youtube_search', `Searching YouTube: "${query}"`, {
        query,
      });

      const videos = await searchYouTube(query, apiKey);
      console.log(`[YOUTUBE_SCANNER] Found ${videos.length} videos for "${query}"`);

      for (const video of videos) {
        const channelId = video.snippet.channelId;

        // Skip excluded channels (e.g., Sporcle official)
        if (EXCLUDED_CHANNEL_IDS.includes(channelId)) continue;

        // Keep first video per channel
        if (!candidatesByChannel.has(channelId)) {
          candidatesByChannel.set(channelId, { video, query });
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      console.error(`[YOUTUBE_SCANNER] Error searching "${query}":`, error);
    }
  }

  // Step 2: Filter to channels we haven't seen before
  const newCandidates: Array<{ channelId: string; video: YouTubeVideo; query: string }> = [];

  for (const [channelId, { video, query }] of candidatesByChannel) {
    const seen = await isChannelSeen(channelId);
    if (!seen) {
      newCandidates.push({ channelId, video, query });
    }
  }

  if (newCandidates.length === 0) {
    return 'No new trivia YouTubers found';
  }

  // Step 3: Fetch channel and video details
  const channelIds = newCandidates.map((c) => c.channelId);
  const videoIds = newCandidates.map((c) => c.video.id.videoId);

  const [channelDetails, videoDetails] = await Promise.all([
    getChannelDetails(channelIds, apiKey),
    getVideoDetails(videoIds, apiKey),
  ]);

  // Step 4: Build discovered channels with view counts
  const discoveredChannels: DiscoveredChannel[] = [];

  for (const { channelId, video, query } of newCandidates) {
    const channel = channelDetails.get(channelId);
    const videoStats = videoDetails.get(video.id.videoId);

    if (!channel) continue;

    const views = parseInt(videoStats?.statistics.viewCount || '0', 10);

    // Filter by minimum views
    if (views < MIN_VIDEO_VIEWS) continue;

    const channelUrl = channel.snippet.customUrl
      ? `https://www.youtube.com/${channel.snippet.customUrl}`
      : `https://www.youtube.com/channel/${channelId}`;

    discoveredChannels.push({
      channelId,
      channelTitle: channel.snippet.title,
      channelUrl,
      subscriberCount: parseInt(channel.statistics.subscriberCount, 10) || 0,
      videoCount: parseInt(channel.statistics.videoCount, 10) || 0,
      triggerVideo: {
        title: video.snippet.title,
        url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        publishedAt: video.snippet.publishedAt,
        views,
      },
      searchQuery: query,
    });
  }

  await ctx.logAction('channels_found', `Found ${discoveredChannels.length} channels with ${MIN_VIDEO_VIEWS}+ views`, {
    count: discoveredChannels.length,
  });

  if (discoveredChannels.length === 0) {
    return `No new trivia YouTubers with ${MIN_VIDEO_VIEWS}+ views found`;
  }

  // Step 5: Sort by video views (highest first) and limit
  discoveredChannels.sort((a, b) => b.triggerVideo.views - a.triggerVideo.views);
  const topChannels = discoveredChannels.slice(0, MAX_CHANNELS);

  // Step 6: Mark only the channels we're notifying about as seen
  for (const channel of topChannels) {
    await markChannelSeen(channel.channelId, channel.channelTitle, channel.channelUrl);
  }

  await sendToSlack(topChannels);
  await ctx.logAction(
    'youtube_channels_notified',
    `Sent ${topChannels.length} channels to Slack`,
    {
      count: topChannels.length,
      channels: topChannels.map((c) => ({
        name: c.channelTitle,
        views: c.triggerVideo.views,
      })),
    }
  );

  return `Found ${topChannels.length} new trivia YouTuber${topChannels.length > 1 ? 's' : ''} - notified in Slack`;
}
