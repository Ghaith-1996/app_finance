/**
 * One page-size contract for the server-rendered first page and every client page request
 * (audit F07). A mismatch made page 2 start inside page 1, repeating stories.
 */
export const FEED_PAGE_SIZE = 100;

/** Link that opens one exact story in the feed (resolved by id, any age — audit F05/F06). */
export function storyHref(newsItemId: string | null | undefined): string {
  return newsItemId ? `/feed?story=${encodeURIComponent(newsItemId)}` : "/feed";
}
