import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // React's development build uses eval() to rebuild server call stacks; production never does,
    // so 'unsafe-eval' is allowed only under `next dev`.
    const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    let supabaseOrigin = "";
    let localHttp = false;
    try {
      const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
      // URL parsing permits wildcard and semicolon hosts, which are not a single CSP origin.
      if (!url.username && !url.password && /^[a-z0-9.:[\]-]+$/i.test(url.hostname)) {
        localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "supabase"].includes(url.hostname);
        if (url.protocol === "https:" || localHttp) supabaseOrigin = ` ${url.origin}`;
      }
    } catch { /* Missing or invalid configuration keeps the strict default policy. */ }
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'unsafe-inline'${devEval} https://challenges.cloudflare.com https://vercel.live`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com https://vercel.live${supabaseOrigin}`,
      "frame-src https://challenges.cloudflare.com https://vercel.live",
      "worker-src 'self' blob:",
      ...(!localHttp ? ["upgrade-insecure-requests"] : []),
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
