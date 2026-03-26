"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Turnstile widget lifecycle state. */
export type TurnstileStatus =
  | "loading"
  | "ready"
  | "verified"
  | "expired"
  | "error"
  | "unavailable";

export interface TurnstileWidgetHandle {
  reset: () => void;
}

export interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: (code: string) => void;
  /** Called once the widget has rendered and the challenge is in progress. */
  onReady?: () => void;
  /** Imperative handle ref (React 19 ref-as-prop). */
  ref?: React.Ref<TurnstileWidgetHandle>;
  action?: string;
  className?: string;
  appearance?: "always" | "interaction-only";
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";

/** Timeout (ms) before treating script load as failed. */
const SCRIPT_LOAD_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TurnstileWidget({
  onSuccess,
  onExpire,
  onError,
  onReady,
  ref,
  action,
  className,
  appearance = "always",
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== "undefined" && !!window.turnstile,
  );
  const [scriptFailed, setScriptFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  // Stable callback refs to avoid re-renders tearing down the widget.
  const onSuccessRef = useRef(onSuccess);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Expose imperative reset via ref.
  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }));

  // Load the Turnstile script (re-runs on retryCount change).
  useEffect(() => {
    if (typeof window === "undefined" || window.turnstile) return;

    if (document.getElementById(SCRIPT_ID)) {
      const prev = window.onTurnstileLoad;
      window.onTurnstileLoad = () => {
        prev?.();
        setScriptReady(true);
      };
      return;
    }

    const timeout = setTimeout(() => {
      if (!window.turnstile) {
        setScriptFailed(true);
        onErrorRef.current?.("script_timeout");
      }
    }, SCRIPT_LOAD_TIMEOUT);

    window.onTurnstileLoad = () => {
      clearTimeout(timeout);
      setScriptReady(true);
    };

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      clearTimeout(timeout);
      setScriptFailed(true);
      onErrorRef.current?.("script_load_error");
    };
    document.head.appendChild(script);

    return () => clearTimeout(timeout);
  }, [retryCount]);

  // Render widget when the script is ready.
  useEffect(() => {
    if (
      !scriptReady ||
      !window.turnstile ||
      !containerRef.current ||
      !siteKey
    )
      return;

    // Avoid double-render.
    if (widgetIdRef.current !== null) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      appearance,
      callback: (token: string) => onSuccessRef.current(token),
      "expired-callback": () => onExpireRef.current?.(),
      "error-callback": (code: string) => onErrorRef.current?.(code),
    });

    onReadyRef.current?.();

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget may already be gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, [scriptReady, siteKey, action, appearance]);

  if (!siteKey) {
    return (
      <p className="text-[11px] text-slate-600">
        Bot protection unavailable (missing site key).
      </p>
    );
  }

  if (scriptFailed) {
    return (
      <div className="flex items-center gap-2 py-2 text-[11px] text-amber-400">
        <span>Verification failed to load.</span>
        <button
          type="button"
          onClick={() => {
            const old = document.getElementById(SCRIPT_ID);
            if (old) old.remove();
            delete window.onTurnstileLoad;
            setScriptFailed(false);
            setScriptReady(false);
            setRetryCount((c) => c + 1);
          }}
          className="underline hover:text-amber-300"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("min-h-[65px]", className)}
      aria-label="Bot verification"
    />
  );
}

// ---------------------------------------------------------------------------
// Hook — state-machine driven
// ---------------------------------------------------------------------------

export interface UseTurnstileReturn {
  status: TurnstileStatus;
  token: string | null;
  /** `true` when the challenge has been solved and a token is available. */
  canSubmit: boolean;
  /** Human-readable hint for the current state, or `null` when verified. */
  statusMessage: string | null;
  /** Reset the widget for a fresh challenge (call after submission or to retry). */
  reset: () => void;
  /** Ref to pass to `<TurnstileWidget ref={...} />`. */
  widgetRef: React.RefObject<TurnstileWidgetHandle | null>;
  /** Props to spread onto `<TurnstileWidget />`. */
  widgetProps: Pick<
    TurnstileWidgetProps,
    "onSuccess" | "onExpire" | "onError" | "onReady"
  >;
}

export function useTurnstile(): UseTurnstileReturn {
  const widgetRef = useRef<TurnstileWidgetHandle | null>(null);
  const [token, setTokenRaw] = useState<string | null>(null);
  const [status, setStatus] = useState<TurnstileStatus>(() => {
    const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
    return key ? "loading" : "unavailable";
  });

  const onSuccess = useCallback((t: string) => {
    setTokenRaw(t);
    setStatus("verified");
  }, []);

  const onExpire = useCallback(() => {
    setTokenRaw(null);
    // Auto-retry: reset widget for a fresh challenge.
    setStatus("ready");
    widgetRef.current?.reset();
  }, []);

  const onError = useCallback(() => {
    setTokenRaw(null);
    setStatus("error");
  }, []);

  const onReady = useCallback(() => {
    setStatus((prev) => (prev === "loading" ? "ready" : prev));
  }, []);

  const reset = useCallback(() => {
    setTokenRaw(null);
    setStatus("ready");
    widgetRef.current?.reset();
  }, []);

  const canSubmit = status === "verified";

  const statusMessage = (() => {
    switch (status) {
      case "loading":
        return "Loading verification\u2026";
      case "ready":
        return "Completing verification\u2026";
      case "verified":
        return null;
      case "expired":
        return "Verification expired. Retrying\u2026";
      case "error":
        return "Verification failed.";
      case "unavailable":
        return "Bot protection unavailable.";
      default:
        return null;
    }
  })();

  return {
    status,
    token,
    canSubmit,
    statusMessage,
    reset,
    widgetRef,
    widgetProps: { onSuccess, onExpire, onError, onReady },
  };
}

// ---------------------------------------------------------------------------
// Convenience wrapper — widget + inline status / retry
// ---------------------------------------------------------------------------

export function TurnstileBlock({
  turnstile,
  action,
  className,
}: {
  turnstile: UseTurnstileReturn;
  action?: string;
  className?: string;
}) {
  const { status, statusMessage, widgetRef, widgetProps, reset: retry } = turnstile;

  return (
    <div className={className}>
      <TurnstileWidget
        ref={widgetRef}
        {...widgetProps}
        action={action}
      />
      {statusMessage && (
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span
            className={cn(
              status === "error"
                ? "text-red-400"
                : status === "unavailable"
                  ? "text-slate-600"
                  : "text-slate-500",
            )}
          >
            {statusMessage}
          </span>
          {status === "error" && (
            <button
              type="button"
              onClick={retry}
              className="text-brand underline hover:text-brand-strong"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
