import "server-only";

import { createHash, randomInt } from "node:crypto";

import { createLogger } from "@/lib/logger";
import type { ConfirmPhoneCodeResult, SendPhoneCodeResult } from "@/lib/notifications/types";
import { isTwilioConfigured, sendTwilioSms, type TwilioSendResult } from "@/lib/notifications/delivery";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * SMS phone possession verification (audit H2). Limits (10-minute expiry, 5 guesses, 60s resend
 * cooldown, 5 sends per hour) are enforced atomically in migration 038.
 */

const log = createLogger("phone-verification");
const CODE_RE = /^\d{6}$/;

export type SendCodeResult = SendPhoneCodeResult;

export type ConfirmCodeResult = ConfirmPhoneCodeResult;

export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Binds the code to the user and number, so a code issued for one cannot verify another. */
export function hashVerificationCode(userId: string, phoneNumber: string, code: string): string {
  return createHash("sha256").update(`${userId}:${phoneNumber}:${code}`).digest("hex");
}

function waitText(seconds: number): string {
  return seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
}

export async function sendPhoneVerificationCodeForUser(
  userId: string,
  phoneNumber: string,
  deps: { generateCode?: () => string } = {},
): Promise<SendCodeResult> {
  // A missing SMS configuration must not use up the user's cooldown or hourly allowance.
  if (!isTwilioConfigured()) {
    log.error("verification SMS unavailable: Twilio is not configured");
    return { ok: false, error: "Text messages are unavailable right now. Please try again later." };
  }

  const code = (deps.generateCode ?? generateVerificationCode)();
  const codeHash = hashVerificationCode(userId, phoneNumber, code);
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("issue_phone_verification", {
    p_user_id: userId,
    p_phone: phoneNumber,
    p_code_hash: codeHash,
  });
  if (error) {
    log.error("issue_phone_verification failed", { error: error.message });
    return { ok: false, error: "Could not start phone verification. Please try again later." };
  }

  const issued = (Array.isArray(data) ? data[0] : data) as
    | { outcome?: string; retry_after_seconds?: number }
    | null;
  if (issued?.outcome !== "issued") {
    const retryAfterSeconds = Number(issued?.retry_after_seconds ?? 60);
    return {
      ok: false,
      error:
        issued?.outcome === "hourly_limit"
          ? `Too many codes requested. Try again in ${waitText(retryAfterSeconds)}.`
          : `Please wait ${waitText(retryAfterSeconds)} before requesting another code.`,
      retryAfterSeconds,
    };
  }

  let sent: TwilioSendResult;
  try {
    sent = await sendTwilioSms(
      phoneNumber,
      `Your Pulsefolio verification code is ${code}. It expires in 10 minutes. Reply STOP to opt out.`,
    );
  } catch (sendError) {
    // Thrown before any request reached Twilio: nothing was sent.
    sent = {
      status: "failed",
      providerMessageId: null,
      errorText: sendError instanceof Error ? sendError.message : String(sendError),
    };
  }
  if (sent.status === "sent") return { ok: true };

  log.warn("verification SMS not confirmed", { status: sent.status, error: sent.errorText });
  if (sent.status === "failed") {
    // Definitely not delivered: void this code and refund the send. An uncertain result keeps the
    // attempt, because the message may still arrive.
    const { error: releaseError } = await supabase.rpc("release_phone_verification", {
      p_user_id: userId,
      p_code_hash: codeHash,
    });
    if (releaseError) log.error("release_phone_verification failed", { error: releaseError.message });
  }
  return {
    ok: false,
    error:
      sent.status === "uncertain"
        ? "We could not confirm the code was sent. If it arrives within a few minutes you can still use it."
        : "We could not send a code to that number. Check it and try again.",
  };
}

export async function confirmPhoneVerificationCodeForUser(
  userId: string,
  phoneNumber: string,
  code: string,
): Promise<ConfirmCodeResult> {
  const trimmed = code.trim();
  if (!CODE_RE.test(trimmed)) {
    return { ok: false, error: "Enter the 6-digit code from the text message." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("confirm_phone_verification", {
    p_user_id: userId,
    p_phone: phoneNumber,
    p_code_hash: hashVerificationCode(userId, phoneNumber, trimmed),
  });
  if (error) {
    log.error("confirm_phone_verification failed", { error: error.message });
    return { ok: false, error: "Could not verify the code. Please try again later." };
  }

  switch (data as string) {
    case "verified":
      return { ok: true };
    case "invalid":
      return { ok: false, error: "That code is not correct." };
    case "expired":
      return { ok: false, error: "That code has expired. Request a new one." };
    case "too_many_attempts":
      return { ok: false, error: "Too many incorrect attempts. Request a new code." };
    default:
      return { ok: false, error: "No active code for this number. Request a new one." };
  }
}
