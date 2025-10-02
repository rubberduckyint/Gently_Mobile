import "server-only";

import { headers } from "next/headers";

import { initAuth } from "@gently/auth";

import { env } from "~/env";

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
  smtpPort: Number(env.EMAIL_SERVER_PORT),
  smtpUser: env.EMAIL_SERVER_USER,
  smtpPassword: env.EMAIL_SERVER_PASSWORD,
});

export const getSession = async () =>
  auth.api.getSession({ headers: await headers() });
