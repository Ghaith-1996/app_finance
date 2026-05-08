import type { DailyDigestSnapshot, DigestSnapshotStory } from "@/lib/notifications/types";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function storySummary(story: DigestSnapshotStory): string {
  return story.aiSummary || story.whyItMatters || "Open the digest page for the full stored snapshot.";
}

export function buildStoryLink(baseUrl: string, digestId: string, newsItemId: string): string {
  return `${baseUrl}/digest/${digestId}?story=${encodeURIComponent(newsItemId)}#story-${encodeURIComponent(newsItemId)}`;
}

function renderStory(story: DigestSnapshotStory, index: number, digest: DailyDigestSnapshot, baseUrl: string): string {
  const storyHref = escapeHtml(buildStoryLink(baseUrl, digest.id, story.newsItemId));
  const matchedSymbols = escapeHtml(story.matchedSymbols.join(", ") || "General market");
  const relevance = story.relevanceScore != null ? ` • Match ${Math.round(story.relevanceScore)}` : "";

  return `
    <div style="padding:18px 0;${index === 0 ? "" : "border-top:1px solid rgba(148, 163, 184, 0.14);"}">
      <p style="margin:0;font-size:12px;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">
        #${index + 1} • ${escapeHtml(story.source)}
      </p>
      <h2 style="margin:10px 0 8px;font-size:20px;line-height:1.35;">
        <a href="${storyHref}" style="color:#f8fafc;text-decoration:none;">
          ${escapeHtml(story.headline)}
        </a>
      </h2>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#cbd5e1;">
        ${escapeHtml(storySummary(story))}
      </p>
      <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
        Matched: ${matchedSymbols}${escapeHtml(relevance)}
      </p>
    </div>
  `;
}

export function renderDailyDigestEmailHtml({
  digest,
  baseUrl,
}: {
  digest: DailyDigestSnapshot;
  baseUrl: string;
}): string {
  const digestHref = escapeHtml(`${baseUrl}/digest/${digest.id}`);
  const storiesHtml = digest.topStories
    .map((story, index) => renderStory(story, index, digest, baseUrl))
    .join("");

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px 0;background-color:#081018;color:#e2e8f0;font-family:Arial, Helvetica, sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:0 16px;">
      <div style="border-radius:24px;border:1px solid rgba(148, 163, 184, 0.18);background-color:#0f172a;overflow:hidden;">
        <div style="padding:28px 28px 20px;background:linear-gradient(135deg, rgba(16,185,129,0.18), rgba(15,23,42,0.96));">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;">
            Pulsefolio Morning Digest
          </p>
          <h1 style="margin:12px 0 8px;font-size:30px;line-height:1.2;color:#f8fafc;">
            9:00 AM Eastern snapshot
          </h1>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#cbd5e1;">
            ${escapeHtml(digest.summaryLine)}
          </p>
        </div>

        <div style="padding:24px 28px 28px;">
          <div style="margin-bottom:20px;padding:16px 18px;border-radius:18px;background-color:rgba(148, 163, 184, 0.08);">
            <p style="margin:0;font-size:12px;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">
              Overnight window
            </p>
            <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#f8fafc;">
              Stories matched from the prior 5:00 PM ET close through this morning&#39;s 9:00 AM ET digest.
            </p>
            <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#cbd5e1;">
              Open the full stored digest:
              <a href="${digestHref}" style="color:#34d399;text-decoration:underline;">
                View in Pulsefolio
              </a>
            </p>
          </div>

          <div>${storiesHtml}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
