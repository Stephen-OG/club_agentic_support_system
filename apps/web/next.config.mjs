import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkspaceEnv } from "./env-config.mjs";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");
const { merged, publicEnv } = loadWorkspaceEnv({ appDir, repoRoot });

for (const key of [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "OPENAI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
]) {
  if (!process.env[key] && merged[key]) {
    process.env[key] = merged[key];
  }
}

for (const [key, value] of Object.entries(publicEnv)) {
  process.env[key] = value;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  env: publicEnv,
  logging: {
    browserToTerminal: true
  }
};

export default nextConfig;
