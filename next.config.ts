import type { NextConfig } from "next";
import path from "path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isDev = process.env.NODE_ENV === "development";

const cspHeader = [
  "default-src 'self'",
  // Scripts: allow inline for Next.js hydration; eval only in dev
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Styles: inline is required by Tailwind and shadcn
  "style-src 'self' 'unsafe-inline'",
  // Images: self + blob (cover image preview) + data URIs
  "img-src 'self' blob: data:",
  // Fonts from self only
  "font-src 'self'",
  // OpenStreetMap map embeds
  "frame-src https://www.openstreetmap.org",
  // No plugins
  "object-src 'none'",
  // Restrict base tag
  "base-uri 'self'",
  // Forms stay on same origin
  "form-action 'self'",
  // No clickjacking via frame embedding
  "frame-ancestors 'none'",
  // Force HTTPS in production
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle for Docker
  output: "standalone",

  serverExternalPackages: ["bcryptjs", "speakeasy", "qrcode", "mariadb", "@prisma/adapter-mariadb"],

  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  webpack(config) {
    // Redirect @prisma/client → generated TypeScript source so the build
    // never attempts to load the non-existent .prisma/client/default shim.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@prisma/client": path.resolve(__dirname, "generated/prisma/client.ts"),
    };
    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
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
            value: "camera=(), microphone=(), geolocation=()",
          },
          // HSTS: only in production (browsers cache this — do not set in dev)
          ...(!isDev
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
