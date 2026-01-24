import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, magicLink } from "better-auth/plugins";

import { db } from "@gently/db/client";
import { EmailSender, MagicLinkService, OTPService } from "@gently/email";

// Test user configuration for Apple App Review
const TEST_USER_EMAIL = "extraspecialtestuser@gentlyus.com";
const TEST_USER_OTP = "123456";

function isTestUser(email: string): boolean {
  return email.toLowerCase().trim() === TEST_USER_EMAIL.toLowerCase();
}

export function initAuth(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;

  googleClientId: string;
  googleClientSecret: string;

  // Apple Sign In configuration
  appleClientId?: string;
  appleClientSecret?: string;
  appleAppBundleId?: string;
  appleEnabled?: boolean;

  // Email configuration for magic links
  emailFrom: string;
  emailApiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
}) {
  // Initialize email service if SMTP is configured
  let magicLinkService: MagicLinkService | null = null;
  let otpService: OTPService | null = null;

  if (options.smtpHost && options.smtpPort && options.emailFrom) {
    const emailSender = new EmailSender({
      smtpHost: options.smtpHost,
      smtpPort: Number(options.smtpPort),
      smtpUser: options.smtpUser,
      smtpPassword: options.smtpPassword,
      emailFrom: options.emailFrom,
    });

    magicLinkService = new MagicLinkService(emailSender);
    otpService = new OTPService(emailSender);
  }

  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          try {
            if (magicLinkService) {
              await magicLinkService.sendMagicLink({
                email,
                url,
                productName: "Gently",
              });
              console.log(`Magic link sent to ${email}`);
            } else {
              // Fallback for development or missing email config
              console.log(`Magic link for ${email}: ${url}`);
              console.warn(
                "Email service not configured. Using console fallback.",
              );
            }
          } catch (error) {
            console.error("Failed to send magic link:", error);
            throw error;
          }
        },
      }),
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          console.log(`🔥 sendVerificationOTP called with:`, {
            email,
            otp,
            type,
          });

          // Skip sending email for test user (Apple App Review)
          if (isTestUser(email)) {
            console.log(
              `🧪 [Test Mode] Test user detected, skipping email send`,
            );
            console.log(`🧪 [Test Mode] Use OTP: ${TEST_USER_OTP}`);
            return;
          }

          try {
            if (otpService) {
              console.log(`📧 Using email service to send OTP`);
              await otpService.sendOTP({
                email,
                otp,
                productName: "Gently",
              });
              console.log(`✅ OTP sent to ${email}`);
            } else {
              // Fallback for development or missing email config
              console.log(`📝 OTP for ${email}: ${otp}`);
              console.warn(
                "⚠️ Email service not configured. Using console fallback.",
              );
            }
          } catch (error) {
            console.error("❌ Failed to send OTP:", error);
            throw error;
          }
        },
        // Generate a fixed OTP for test user, random for others
        generateOTP({ email }) {
          if (isTestUser(email)) {
            console.log(`🧪 [Test Mode] Generating fixed OTP for test user`);
            return TEST_USER_OTP;
          }
          // Default random 6-digit OTP
          return Math.floor(100000 + Math.random() * 900000).toString();
        },
        // Enable OTP storage and validation to prevent accepting any OTP
        storeOTP: "hashed",
        // Set reasonable limits
        expiresIn: 300, // 5 minutes
        allowedAttempts: 3, // Max 3 attempts per OTP
        otpLength: 6, // 6-digit OTP
      }),
      expo() as unknown as BetterAuthPlugin,
    ],
    socialProviders: {
      google: {
        clientId: options.googleClientId,
        clientSecret: options.googleClientSecret,
      },
      ...(options.appleEnabled &&
        options.appleClientId &&
        options.appleClientSecret && {
          apple: {
            clientId: options.appleClientId,
            clientSecret: options.appleClientSecret,
            redirectURI: `${options.baseUrl}/api/auth/callback/apple`,
            // Required for native iOS apps
            ...(options.appleAppBundleId && {
              appBundleIdentifier: options.appleAppBundleId,
            }),
          },
        }),
    },
    trustedOrigins: ["gently://", "gently://*", "https://appleid.apple.com"],
  } as BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
