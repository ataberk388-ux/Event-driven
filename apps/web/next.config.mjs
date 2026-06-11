import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the shared monorepo-root .env so server code (Prisma, auth) sees the
// same vars the rest of the workspace uses.
const rootDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(rootDir, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma client + workspace packages are transpiled/used server-side.
  transpilePackages: [
    "@synapse/db",
    "@synapse/auth",
    "@synapse/events",
    "@synapse/env",
    "@synapse/ratelimit",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Workspace TS packages use explicit ".js" extensions in relative imports
  // (required for Node ESM in the services). Teach webpack to resolve them to
  // the underlying ".ts" sources.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
