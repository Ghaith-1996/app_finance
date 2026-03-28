import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSpawnArticleExtractionWorker = vi.fn();

vi.mock("@/lib/services/news/extraction-trigger", () => ({
  spawnArticleExtractionWorker: (...args: unknown[]) => mockSpawnArticleExtractionWorker(...args),
}));

import { extractPublisherContent } from "@/lib/services/news/publisher-extract";

function createSupabaseMock(rows: Array<Record<string, unknown>>) {
  const updateCalls: Array<{ values: Record<string, unknown>; ids: string[] }> = [];

  const supabase = {
    from(table: string) {
      if (table !== "news_items") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: () => ({
          in: async () => ({ data: rows, error: null }),
          is: () => ({
            not: () => ({
              in: () => ({
                order: () => ({
                  limit: async () => ({ data: rows, error: null }),
                }),
              }),
            }),
          }),
        }),
        update(values: Record<string, unknown>) {
          return {
            in(idsColumn: string, ids: string[]) {
              if (idsColumn !== "id") {
                throw new Error(`Unexpected column ${idsColumn}`);
              }
              updateCalls.push({ values, ids });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { supabase, updateCalls };
}

describe("extractPublisherContent", () => {
  beforeEach(() => {
    mockSpawnArticleExtractionWorker.mockReset();
  });

  it("skips unsupported publisher URLs and marks them skipped", async () => {
    const { supabase, updateCalls } = createSupabaseMock([
      {
        id: "news-1",
        url: "http://127.0.0.1/internal",
        source_type: "newsapi",
        extracted_content: null,
        extraction_status: null,
      },
    ]);

    const result = await extractPublisherContent(supabase as never, {
      articleIds: ["news-1"],
    });

    expect(result.queued).toBe(0);
    expect(result.skippedUnsupportedUrl).toBe(1);
    expect(mockSpawnArticleExtractionWorker).not.toHaveBeenCalled();
    expect(updateCalls).toContainEqual({
      values: {
        extraction_status: "skipped",
        extraction_error: "Unsupported publisher URL",
      },
      ids: ["news-1"],
    });
  });

  it("queues allowed publisher URLs", async () => {
    const { supabase, updateCalls } = createSupabaseMock([
      {
        id: "news-2",
        url: "https://example.com/article",
        source_type: "newsapi",
        extracted_content: null,
        extraction_status: null,
      },
    ]);

    const result = await extractPublisherContent(supabase as never, {
      articleIds: ["news-2"],
    });

    expect(result.queued).toBe(1);
    expect(result.processedArticleIds).toEqual(["news-2"]);
    expect(mockSpawnArticleExtractionWorker).toHaveBeenCalledWith(["news-2"]);
    expect(updateCalls).toContainEqual({
      values: { extraction_status: "queued" },
      ids: ["news-2"],
    });
  });
});
