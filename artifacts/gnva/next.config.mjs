/** Les pages et Route Handlers appartiennent au même serveur Next.js. */
const configuration = {
  typescript: { ignoreBuildErrors: true },distDir: process.env.GNVA_TEST_DIST_DIR ?? ".next",
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [
      "../../.local/**/*",
      "../../.cache/**/*",
      "./public/uploads/**/*",
      "../../.env*",
    ],
  },
  allowedDevOrigins: [
    "*.replit.dev",
    "*.replit.app",
    "localhost",
"10.164.26.30",
    "127.0.0.1",
    "192.168.1.219",        // ← votre IP locale
    "192.168.1.*",          // ← toutes les IP de votre réseau local (optionnel)
    process.env.REPLIT_DEV_DOMAIN,
  ].filter(Boolean),
  serverExternalPackages: ["@prisma/client", "@node-rs/argon2"],
  transpilePackages: ['@workspace/api-client-react', 'lucide-react'],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, private, max-age=0" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self)",
          },
        ],
      },
    ];
  },
};
export default configuration;