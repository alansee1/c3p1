import { execSync } from 'child_process';

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

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function fetchRedditJson(url: string): RedditResponse {
  const json = execSync(`curl -s -A "${USER_AGENT}" "${url}"`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
  });
  return JSON.parse(json) as RedditResponse;
}

function parseRedditPosts(response: RedditResponse): { title: string; link: string; snippet: string }[] {
  if (!response.data?.children) {
    return [];
  }

  const posts = response.data.children.filter((child) => child.kind === 't3');

  return posts.map((post) => ({
    title: post.data.title,
    link: `https://www.reddit.com${post.data.permalink}`,
    snippet: post.data.selftext.slice(0, 200) || post.data.title,
  }));
}

async function main() {
  const subreddits = ['gamingsuggestions', 'ShouldIbuythisgame'];

  for (const subreddit of subreddits) {
    console.log(`\n=== r/${subreddit} (new posts) ===`);
    const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=5`;
    const response = fetchRedditJson(url);
    const posts = parseRedditPosts(response);

    console.log(`Found ${posts.length} posts:\n`);
    for (const post of posts) {
      console.log(`Title: ${post.title}`);
      console.log(`Link: ${post.link}`);
      console.log(`Snippet: ${post.snippet.slice(0, 100)}...`);
      console.log();
    }
  }

  console.log('\n=== Broad search: "multiplayer quiz game" ===');
  const searchUrl = `https://www.reddit.com/search.json?q=multiplayer%20quiz%20game&sort=new&t=week&type=link&limit=5`;
  const searchResponse = fetchRedditJson(searchUrl);
  const searchPosts = parseRedditPosts(searchResponse);

  console.log(`Found ${searchPosts.length} posts:\n`);
  for (const post of searchPosts) {
    console.log(`Title: ${post.title}`);
    console.log(`Link: ${post.link}`);
    console.log();
  }
}

main().catch(console.error);
