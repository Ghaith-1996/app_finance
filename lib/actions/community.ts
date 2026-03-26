"use server";

import { createClient } from "@/lib/supabase/server";
import { FinnhubError, searchSymbols } from "@/lib/services/finnhub";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import type {
  CommunityPost,
  CommunityComment,
  CommunityAuthor,
  CreatePostResult,
  CreateCommentResult,
  ActiveDiscussion,
} from "@/lib/community/types";
import {
  extractTickerHashtags,
  extractTickers,
  validatePostBody,
  validateCommentBody,
} from "@/lib/community/types";

function authorFromRow(row: {
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  handle?: string | null;
  email?: string | null;
  raw_user_meta_data?: Record<string, unknown> | null;
}): CommunityAuthor {
  const meta = row.raw_user_meta_data;
  const derivedDisplayName =
    [row.first_name?.trim(), row.last_name?.trim()].filter(Boolean).join(" ") || null;
  return {
    userId: row.user_id,
    displayName:
      row.display_name ||
      derivedDisplayName ||
      (meta?.full_name as string) ||
      (meta?.name as string) ||
      (row.email ? row.email.split("@")[0] : "User"),
    avatarUrl: row.avatar_url || (meta?.avatar_url as string) || null,
    handle: row.handle || null,
  };
}

const FEED_PAGE_SIZE = 20;

async function validateTickerHashtags(tickers: string[]): Promise<string | null> {
  if (tickers.length === 0) return null;

  for (const ticker of tickers) {
    try {
      const results = await searchSymbols(ticker);
      const exactMatch = results.some((result) => result.symbol.toUpperCase() === ticker);
      if (!exactMatch) {
        return `#${ticker} is not a recognized stock symbol. Use a market hashtag like #crypto, or a valid stock tag like #AAPL.`;
      }
    } catch (error) {
      if (error instanceof FinnhubError) {
        return "Could not verify stock hashtags right now. Try again in a moment.";
      }
      return "Could not verify stock hashtags right now. Try again in a moment.";
    }
  }

  return null;
}

async function getProfileForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data } = await supabase
    .from("user_profiles")
    .select("user_id, first_name, last_name, display_name, avatar_url, handle")
    .eq("user_id", userId)
    .maybeSingle();

  return (data as Record<string, unknown> | null) ?? null;
}

export async function getHomeFeed(cursor?: string): Promise<{
  posts: CommunityPost[];
  nextCursor: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { posts: [], nextCursor: null };

  let query = supabase
    .from("community_posts")
    .select(`
      id, user_id, body, created_at,
      community_post_tickers(ticker),
      community_comments(count)
    `)
    .order("created_at", { ascending: false })
    .limit(FEED_PAGE_SIZE + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: rows, error } = await query;
  if (error || !rows) return { posts: [], nextCursor: null };

  const userIds = [...new Set(rows.map((r) => r.user_id as string))];
  const profileMap = new Map<string, Record<string, unknown>>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, first_name, last_name, display_name, avatar_url, handle")
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.user_id as string, p as Record<string, unknown>);
    }
  }

  const posts: CommunityPost[] = rows.slice(0, FEED_PAGE_SIZE).map((row) => {
    const profile = profileMap.get(row.user_id as string) ?? {};
    const tickers = Array.isArray(row.community_post_tickers)
      ? (row.community_post_tickers as Array<{ ticker: string }>).map((t) => t.ticker)
      : [];
    const commentArr = row.community_comments as unknown;
    const commentCount =
      Array.isArray(commentArr) && commentArr.length > 0
        ? (commentArr[0] as { count: number }).count
        : 0;

    return {
      id: row.id as string,
      author: authorFromRow({ user_id: row.user_id as string, ...profile }),
      body: row.body as string,
      tickers,
      commentCount,
      createdAt: row.created_at as string,
    };
  });

  const nextCursor =
    rows.length > FEED_PAGE_SIZE ? (posts[posts.length - 1]?.createdAt ?? null) : null;

  return { posts, nextCursor };
}

export async function createPost(body: string, turnstileToken?: string): Promise<CreatePostResult> {
  const validationError = validatePostBody(body);
  if (validationError) return { ok: false, error: validationError };

  const turnstile = await verifyTurnstileToken({ token: turnstileToken });
  if (!turnstile.success) return { ok: false, error: turnstile.message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const trimmed = body.trim();
  const cashtagTickers = extractTickers(trimmed);
  const hashtagTickers = extractTickerHashtags(trimmed);
  const hashtagValidationError = await validateTickerHashtags(hashtagTickers);
  if (hashtagValidationError) return { ok: false, error: hashtagValidationError };
  const tickers = [...new Set([...cashtagTickers, ...hashtagTickers])];

  const { data: inserted, error: insertError } = await supabase
    .from("community_posts")
    .insert({ user_id: user.id, body: trimmed })
    .select("id, user_id, body, created_at")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? "Failed to create post." };
  }

  if (tickers.length > 0) {
    await supabase
      .from("community_post_tickers")
      .insert(tickers.map((ticker) => ({ post_id: inserted.id, ticker })));
  }

  const profile = await getProfileForUser(supabase, user.id);
  const meta = user.user_metadata ?? {};
  const post: CommunityPost = {
    id: inserted.id as string,
    author: authorFromRow({
      user_id: user.id,
      ...(profile ?? {}),
      raw_user_meta_data: meta as Record<string, unknown>,
      email: user.email ?? null,
    }),
    body: trimmed,
    tickers,
    commentCount: 0,
    createdAt: inserted.created_at as string,
  };

  return { ok: true, post };
}

export async function getPostComments(postId: string): Promise<CommunityComment[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows, error } = await supabase
    .from("community_comments")
    .select("id, post_id, user_id, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error || !rows) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id as string))];
  const profileMap = new Map<string, Record<string, unknown>>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, first_name, last_name, display_name, avatar_url, handle")
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.user_id as string, p as Record<string, unknown>);
    }
  }

  return rows.map((row) => {
    const profile = profileMap.get(row.user_id as string) ?? {};
    return {
      id: row.id as string,
      postId: row.post_id as string,
      author: authorFromRow({ user_id: row.user_id as string, ...profile }),
      body: row.body as string,
      createdAt: row.created_at as string,
    };
  });
}

export async function createComment(postId: string, body: string, turnstileToken?: string): Promise<CreateCommentResult> {
  const validationError = validateCommentBody(body);
  if (validationError) return { ok: false, error: validationError };

  const turnstile = await verifyTurnstileToken({ token: turnstileToken });
  if (!turnstile.success) return { ok: false, error: turnstile.message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const trimmed = body.trim();

  const { data: inserted, error: insertError } = await supabase
    .from("community_comments")
    .insert({ post_id: postId, user_id: user.id, body: trimmed })
    .select("id, post_id, user_id, body, created_at")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? "Failed to create comment." };
  }

  const profile = await getProfileForUser(supabase, user.id);
  const meta = user.user_metadata ?? {};
  const comment: CommunityComment = {
    id: inserted.id as string,
    postId: inserted.post_id as string,
    author: authorFromRow({
      user_id: user.id,
      ...(profile ?? {}),
      raw_user_meta_data: meta as Record<string, unknown>,
      email: user.email ?? null,
    }),
    body: trimmed,
    createdAt: inserted.created_at as string,
  };

  return { ok: true, comment };
}

export async function getTrendingTickers(): Promise<Array<{ ticker: string; mentionCount: number }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("community_post_tickers")
    .select("ticker, post_id, community_posts!inner(created_at)")
    .gte("community_posts.created_at", cutoff);

  if (error || !data) return [];

  const counts = new Map<string, number>();
  for (const row of data) {
    const t = row.ticker as string;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ticker, mentionCount]) => ({ ticker, mentionCount }));
}

export async function getActiveDiscussions(): Promise<ActiveDiscussion[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("community_posts")
    .select("id, body, user_id, community_comments(count)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  type PostRow = {
    id: string;
    body: string;
    user_id: string;
    community_comments: Array<{ count: number }> | unknown;
  };

  const withCounts = (data as PostRow[])
    .map((row) => {
      const commentArr = row.community_comments;
      const count =
        Array.isArray(commentArr) && commentArr.length > 0
          ? (commentArr[0] as { count: number }).count
          : 0;
      return { ...row, commentCount: count };
    })
    .filter((r) => r.commentCount > 0)
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 5);

  const userIds = [...new Set(withCounts.map((r) => r.user_id))];
  const profileMap = new Map<string, Record<string, unknown>>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, first_name, last_name, display_name, avatar_url, handle")
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.user_id as string, p as Record<string, unknown>);
    }
  }

  return withCounts.map((row) => {
    const profile = profileMap.get(row.user_id) ?? {};
    const author = authorFromRow({ user_id: row.user_id, ...profile });
    return {
      postId: row.id,
      bodyPreview: row.body.slice(0, 80) + (row.body.length > 80 ? "..." : ""),
      commentCount: row.commentCount,
      authorName: author.displayName,
    };
  });
}
