import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// Audit H12: service-role and secret-reading modules are server-only, and no client component
// imports them. ("server-only" makes any client import fail the Next.js build.)

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = ["app", "components", "lib"].flatMap(sourceFiles);
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("server-only boundaries", () => {
  it.each(["lib/supabase/service.ts", "lib/env.ts", "lib/billing/stripe.ts"])("%s is server-only", (file) => {
    expect(read(file)).toMatch(/^import "server-only";/m);
  });

  it("every module that creates a service-role client is server-only, a server action or a route", () => {
    const offenders = files.filter((file) => {
      const text = read(file);
      if (!text.includes("@/lib/supabase/service")) return false;
      const guarded = /^import "server-only";|^"use server";/m.test(text);
      return !guarded && basename(file) !== "route.ts";
    });
    expect(offenders).toEqual([]);
  });

  it("no client component reads a server secret or imports a server-only module directly", () => {
    const offenders = files.filter((file) => {
      const text = read(file);
      if (!/^"use client";/m.test(text)) return false;
      return /@\/lib\/supabase\/service"|@\/lib\/env"|@\/lib\/billing\/stripe"|SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|TWILIO_AUTH_TOKEN|RESEND_API_KEY/.test(text);
    });
    expect(offenders.map((file) => relative(ROOT, join(ROOT, file)))).toEqual([]);
  });
});
