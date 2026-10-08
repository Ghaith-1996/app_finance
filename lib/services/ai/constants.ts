export const ARTICLE_CHAT_MAX_TOKENS = 2000;
export const PORTFOLIO_COPILOT_MAX_TOKENS = 2000;

/**
 * Upper bound for one provider request (audit H3). A hung provider ends as a
 * provider_timeout error (503 to the user, quota refunded) instead of holding the request open.
 */
export const AI_REQUEST_TIMEOUT_MS = 60_000;
