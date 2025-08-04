import "server-only";

import { headers } from "next/headers";

import { initAuth } from "@acme/auth";

import { env } from "~/env";

console.log("🚀 Auth server initialization starting...");
console.log("🔧 Environment variables loaded:", {
  baseUrl: env.NEXT_PUBLIC_BASE_URL,
  emailFrom: env.EMAIL_FROM,
  emailHost: env.EMAIL_SERVER_HOST,
  emailPort: env.EMAIL_SERVER_PORT,
  emailUser: env.EMAIL_SERVER_USER,
  hasEmailPassword: !!env.EMAIL_SERVER_PASSWORD,
});

const baseUrl = env.NEXT_PUBLIC_BASE_URL;

export const auth = initAuth({
  baseUrl,
  productionUrl: env.NEXT_PUBLIC_BASE_URL,
  secret: env.AUTH_SECRET,
  googleClientId: env.AUTH_GOOGLE_ID,
  googleClientSecret: env.AUTH_GOOGLE_SECRET,
  emailFrom: env.EMAIL_FROM,
  // Add email service configuration here if needed
  smtpHost: env.EMAIL_SERVER_HOST,
  smtpPort: env.EMAIL_SERVER_PORT,
  smtpUser: env.EMAIL_SERVER_USER,
  smtpPassword: env.EMAIL_SERVER_PASSWORD,
});

export const getSession = async () =>
  auth.api.getSession({ headers: await headers() });
