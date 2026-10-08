/**
 * Runtime validation for AI chat request bodies (audit H4). JSON is untrusted: a null, numeric or
 * array value must produce a deliberate 400, never a TypeError from `.trim()` and a 500.
 */

export const MAX_CHAT_MESSAGE_LENGTH = 4000;
export const MAX_CHAT_HISTORY_ITEMS = 12;
// Identifier shape (UUIDs in production); the database remains the authority on existence.
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export type ChatHistoryItem = { role: "user" | "assistant"; content: string };

export type ParsedChatRequest = {
  portfolioId: string;
  newsItemId: string | null;
  message: string;
  modelTier: unknown;
  history: ChatHistoryItem[];
  turnstileToken: string | undefined;
};

export type ChatRequestParseResult =
  | { ok: true; value: ParsedChatRequest }
  | { ok: false; error: string };

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : null;
}

export function parseChatHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is ChatHistoryItem =>
        Boolean(item) &&
        typeof item === "object" &&
        ((item as ChatHistoryItem).role === "user" || (item as ChatHistoryItem).role === "assistant") &&
        typeof (item as ChatHistoryItem).content === "string" &&
        (item as ChatHistoryItem).content.trim().length > 0,
    )
    .slice(-MAX_CHAT_HISTORY_ITEMS)
    .map((item) => ({ role: item.role, content: item.content.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH) }));
}

export function parseChatRequestBody(raw: unknown, options: { allowNewsItem: boolean }): ChatRequestParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;

  const portfolioId = optionalString(body.portfolioId);
  const message = optionalString(body.message);
  const newsItemId = optionalString(body.newsItemId);
  const turnstileToken = optionalString(body.turnstileToken);

  if (portfolioId === null || message === null || newsItemId === null || turnstileToken === null) {
    return { ok: false, error: "portfolioId, message, newsItemId and turnstileToken must be strings" };
  }
  const trimmedPortfolioId = portfolioId?.trim() ?? "";
  const trimmedMessage = message?.trim() ?? "";
  if (!trimmedPortfolioId || !trimmedMessage) {
    return { ok: false, error: "portfolioId and message are required" };
  }
  if (!ID_PATTERN.test(trimmedPortfolioId)) {
    return { ok: false, error: "portfolioId is not a valid id" };
  }
  if (trimmedMessage.length > MAX_CHAT_MESSAGE_LENGTH) {
    return { ok: false, error: `message must be at most ${MAX_CHAT_MESSAGE_LENGTH} characters` };
  }

  const trimmedNewsItemId = newsItemId?.trim() || null;
  if (trimmedNewsItemId && (!options.allowNewsItem || !ID_PATTERN.test(trimmedNewsItemId))) {
    return { ok: false, error: "newsItemId is not a valid id" };
  }
  if (turnstileToken && turnstileToken.length > 4096) {
    return { ok: false, error: "turnstileToken is too long" };
  }

  return {
    ok: true,
    value: {
      portfolioId: trimmedPortfolioId,
      newsItemId: trimmedNewsItemId,
      message: trimmedMessage,
      modelTier: body.modelTier,
      history: parseChatHistory(body.history),
      turnstileToken: turnstileToken || undefined,
    },
  };
}
