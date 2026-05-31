export interface CommunityAuthor {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  handle: string | null;
}

export interface CommunityTickerTag {
  ticker: string;
}

export interface CommunityPost {
  id: string;
  author: CommunityAuthor;
  body: string;
  tickers: string[];
  commentCount: number;
  createdAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  author: CommunityAuthor;
  body: string;
  createdAt: string;
}

export interface CreatePostResult {
  ok: boolean;
  post?: CommunityPost;
  error?: string;
}

export interface CreateCommentResult {
  ok: boolean;
  comment?: CommunityComment;
  error?: string;
}

export interface TrendingTicker {
  ticker: string;
  mentionCount: number;
}

export interface ActiveDiscussion {
  postId: string;
  bodyPreview: string;
  commentCount: number;
  authorName: string;
}

const TICKER_REGEX = /\$([A-Z]{1,10})/g;
const TICKER_HASHTAG_REGEX = /#([A-Z]{1,10})\b/g;
const HASHTAG_REGEX = /#([A-Za-z][A-Za-z0-9_]{1,24})\b/g;
const MAX_TICKERS_PER_POST = 5;
const MAX_POST_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 1000;

export function extractTickers(body: string): string[] {
  const matches = [
    ...[...body.matchAll(TICKER_REGEX)].map((m) => m[1]),
  ];
  return [...new Set(matches)].slice(0, MAX_TICKERS_PER_POST);
}

export function extractTickerHashtags(body: string): string[] {
  const matches = [...body.matchAll(TICKER_HASHTAG_REGEX)].map((m) => m[1].toUpperCase());
  return [...new Set(matches)].slice(0, MAX_TICKERS_PER_POST);
}

export function extractHashtags(body: string): string[] {
  const tickers = new Set(extractTickers(body));
  const tickerHashtags = new Set(extractTickerHashtags(body));
  const matches = [...body.matchAll(HASHTAG_REGEX)]
    .map((m) => m[1])
    .filter((tag) => {
      const normalized = tag.toUpperCase();
      return !tickers.has(normalized) && !tickerHashtags.has(normalized);
    })
    .map((tag) => tag.toLowerCase());

  return [...new Set(matches)];
}

export function validatePostBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "Post cannot be empty.";
  if (trimmed.length > MAX_POST_LENGTH) return `Post is too long (max ${MAX_POST_LENGTH} characters).`;
  return null;
}

export function validateCommentBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "Comment cannot be empty.";
  if (trimmed.length > MAX_COMMENT_LENGTH) return `Comment is too long (max ${MAX_COMMENT_LENGTH} characters).`;
  return null;
}
