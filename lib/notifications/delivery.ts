import "server-only";

import {
  buildFeedLink,
  buildStoryLink,
  renderDailyDigestEmailHtml,
} from "@/emails/daily-digest-email";
import {
  requireResendApiKey,
  requireTwilioAccountSid,
  requireTwilioAuthToken,
  requireTwilioMessagingServiceSid,
} from "@/lib/env";
import type {
  DailyDigestDeliveryResult,
  DailyDigestSnapshot,
} from "@/lib/notifications/types";

function formatDigestSubject(digest: DailyDigestSnapshot): string {
  const [year, month, day] = digest.digestDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function buildSmsBody(digest: DailyDigestSnapshot, baseUrl: string): string {
  const bullish = digest.bullishSymbols.length > 0
    ? `Bullish: ${digest.bullishSymbols.join(", ")}.`
    : "Bullish: none.";
  const bearish = digest.bearishSymbols.length > 0
    ? `Bearish: ${digest.bearishSymbols.join(", ")}.`
    : "Bearish: none.";

  const leadStory = digest.topStories[0];
  const readUrl = leadStory
    ? buildStoryLink(baseUrl, digest.id, leadStory.newsItemId)
    : buildFeedLink(baseUrl);

  return `Pulsefolio Morning Digest. ${bullish} ${bearish} Read: ${readUrl}`;
}

function getResendFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || "Pulsefolio <onboarding@resend.dev>";
}

export async function sendDigestEmail(input: {
  digest: DailyDigestSnapshot;
  email: string | null | undefined;
  baseUrl: string;
}): Promise<DailyDigestDeliveryResult> {
  if (!input.email?.trim()) {
    return {
      channel: "email",
      status: "skipped",
      digestId: input.digest.id,
      providerMessageId: null,
      errorText: "Missing recipient email address.",
    };
  }

  const apiKey = requireResendApiKey();
  const html = renderDailyDigestEmailHtml({
    digest: input.digest,
    baseUrl: input.baseUrl,
  });
  const subjectDate = formatDigestSubject(input.digest);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `daily-digest:${input.digest.id}:email`,
    },
    body: JSON.stringify({
      from: getResendFromAddress(),
      to: input.email.trim(),
      subject: `Pulsefolio Morning Digest - ${subjectDate}`,
      html,
    }),
  });

  const payload = await response.json().catch(() => null) as
    | { id?: string; message?: string; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.message ||
      payload?.error ||
      `Resend request failed with status ${response.status}.`,
    );
  }

  return {
    channel: "email",
    status: "sent",
    digestId: input.digest.id,
    providerMessageId: payload?.id ?? null,
    errorText: null,
  };
}

export async function sendDigestSms(input: {
  digest: DailyDigestSnapshot;
  phoneNumber: string | null | undefined;
  baseUrl: string;
}): Promise<DailyDigestDeliveryResult> {
  if (!input.phoneNumber?.trim()) {
    return {
      channel: "sms",
      status: "skipped",
      digestId: input.digest.id,
      providerMessageId: null,
      errorText: "Missing recipient phone number.",
    };
  }

  const accountSid = requireTwilioAccountSid();
  const authToken = requireTwilioAuthToken();
  const messagingServiceSid = requireTwilioMessagingServiceSid();

  const body = new URLSearchParams({
    To: input.phoneNumber.trim(),
    MessagingServiceSid: messagingServiceSid,
    Body: buildSmsBody(input.digest, input.baseUrl),
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(15_000),
      },
    );

    const payload = await response.json().catch(() => null) as
      | { sid?: string; message?: string; code?: number }
      | null;

    if (!response.ok) {
      return {
        channel: "sms",
        status: "failed",
        digestId: input.digest.id,
        providerMessageId: payload?.sid ?? null,
        errorText:
          payload?.message ||
          `Twilio request failed with status ${response.status}.`,
      };
    }

    return {
      channel: "sms",
      status: "sent",
      digestId: input.digest.id,
      providerMessageId: payload?.sid ?? null,
      errorText: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      channel: "sms",
      status: "uncertain",
      digestId: input.digest.id,
      providerMessageId: null,
      errorText: message || "Twilio request did not confirm a final delivery state.",
    };
  }
}

export { buildStoryLink };
