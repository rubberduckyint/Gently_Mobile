import type { BetterAuthOptions } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, magicLink, oAuthProxy } from "better-auth/plugins";

import { db } from "@gently/db/client";
import { EmailSender, MagicLinkService, OTPService } from "@gently/email";

export function initAuth(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;

  googleClientId: string;
  googleClientSecret: string;

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
      smtpPort: options.smtpPort,
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
      oAuthProxy({
        /**
         * Auto-inference blocked by https://github.com/better-auth/better-auth/pull/2891
         */
        currentURL: options.baseUrl,
        productionURL: options.productionUrl,
      }),
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

          if (type === "sign-in") {
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
          } else {
            console.log(`⏭️ Skipping OTP send for type: ${type}`);
          }
        },
      }),
      expo(),
    ],
    socialProviders: {
      google: {
        clientId: options.googleClientId,
        clientSecret: options.googleClientSecret,
      },
    },
    trustedOrigins: ["gently://", "gently://*"],
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
