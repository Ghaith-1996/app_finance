import "server-only";

import type { LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";

import { isPublicIpAddress, validatePublisherUrl } from "@/lib/security/publisher-url";

/**
 * Fetch for untrusted public URLs (audit S1). The destination check is bound to the connection:
 * the socket's DNS lookup goes through createSafeLookup, so the address actually dialled is the
 * one that was validated — a hostname whose answer changes to a private address between a
 * preflight and the request (DNS rebinding) is refused. IP-literal hosts are checked by
 * validatePublisherUrl because Node does not call `lookup` for them.
 *
 * Redirects are never followed here (callers re-validate each hop). Bodies are capped at
 * `maxBytes` and the whole request at `timeoutMs`.
 */

export class UnsafeDestinationError extends Error {
  constructor(reason: string) {
    super(`Refused outbound request: ${reason}`);
    this.name = "UnsafeDestinationError";
  }
}

export type SafeResolver = (hostname: string) => Promise<LookupAddress[]>;

async function defaultResolver(hostname: string): Promise<LookupAddress[]> {
  const { lookup } = await import("node:dns/promises");
  return lookup(hostname, { all: true, verbatim: true });
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** A `lookup` for http(s).request that only ever yields public addresses. */
export function createSafeLookup(resolve: SafeResolver = defaultResolver) {
  return (hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0) {
          callback(new UnsafeDestinationError(`no addresses for ${hostname}`), "");
          return;
        }
        const blocked = addresses.find((entry) => !isPublicIpAddress(entry.address));
        if (blocked) {
          callback(new UnsafeDestinationError(`${hostname} resolves to non-public ${blocked.address}`), "");
          return;
        }
        if (typeof options === "object" && options?.all) {
          callback(null, addresses);
        } else {
          callback(null, addresses[0].address, addresses[0].family);
        }
      },
      (error: NodeJS.ErrnoException) => callback(error, ""),
    );
  };
}

export type SafeFetchOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  maxBytes?: number;
  timeoutMs?: number;
  resolver?: SafeResolver;
  /** Test seam: replaces node:http/https request. */
  requestImpl?: typeof https.request;
};

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

export async function safePublicFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<Response> {
  const validation = validatePublisherUrl(rawUrl);
  if (!validation.ok) {
    throw new UnsafeDestinationError(validation.reason ?? "invalid_url");
  }

  const url = new URL(rawUrl);
  const transport = options.requestImpl ?? (url.protocol === "https:" ? https.request : http.request);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, response?: Response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(response!);
    };

    const request = transport(url, {
      method: "GET",
      headers: options.headers,
      lookup: createSafeLookup(options.resolver) as never,
      // Fresh connection per request so a pooled socket to an earlier address is never reused.
      agent: false,
    });

    const timer = setTimeout(() => {
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const onAbort = () => request.destroy(new Error("Request aborted"));
    if (options.signal?.aborted) onAbort();
    options.signal?.addEventListener("abort", onAbort);

    request.on("error", (error) => finish(error));
    request.on("response", (incoming) => {
      const chunks: Buffer[] = [];
      let received = 0;
      incoming.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          incoming.destroy();
          request.destroy();
          finish(new Error(`Response exceeded ${maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("error", (error) => finish(error));
      incoming.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value === undefined) continue;
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = incoming.statusCode ?? 0;
        if (status < 200 || status > 599) {
          finish(new Error(`Unexpected status ${status}`));
          return;
        }
        finish(
          null,
          new Response(NULL_BODY_STATUSES.has(status) ? null : Buffer.concat(chunks), { status, headers }),
        );
      });
    });
    request.end();
  });
}

/** fetch-compatible adapter (GET only, manual redirects) for code written against `fetch`. */
export const safePublicFetchAsFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (init?.method && init.method.toUpperCase() !== "GET") {
    throw new UnsafeDestinationError("only GET is supported");
  }
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, name) => {
    headers[name] = value;
  });
  return safePublicFetch(url, { headers, signal: init?.signal ?? undefined });
};
