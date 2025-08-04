import type { BetterAuthOptions } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, oAuthProxy } from "better-auth/plugins";

import { db } from "@acme/db/client";
import { EmailSender, MagicLinkService } from "@acme/email";

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

  console.log("🔧 Initializing auth with email config:", {
    hasSmtpHost: !!options.smtpHost,
    hasSmtpPort: !!options.smtpPort,
    hasEmailFrom: !!options.emailFrom,
    hasSmtpUser: !!options.smtpUser,
    hasSmtpPassword: !!options.smtpPassword,
    smtpHost: options.smtpHost,
    smtpPort: options.smtpPort,
    emailFrom: options.emailFrom,
  });

  if (options.smtpHost && options.smtpPort && options.emailFrom) {
    console.log("✅ Initializing email service with SMTP config");
    const emailSender = new EmailSender({
      smtpHost: options.smtpHost,
      smtpPort: options.smtpPort,
      smtpUser: options.smtpUser,
      smtpPassword: options.smtpPassword,
      emailFrom: options.emailFrom,
    });

    magicLinkService = new MagicLinkService(emailSender);

    // Test email connection
    emailSender
      .verifyConnection()
      .then((isValid) => {
        if (isValid) {
          console.log("✅ Email connection verified successfully");
        } else {
          console.error("❌ Email connection verification failed");
        }
      })
      .catch((error) => {
        console.error("❌ Email connection test error:", error);
      });
  } else {
    console.warn("⚠️ Email service not configured - missing required config");
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
          console.log("🔗 Magic link requested:", { email, url });
          
          // Always modify the URL to point to our custom redirect page
          // This ensures consistent behavior regardless of the callbackURL parameter
          const urlObj = new URL(url);
          urlObj.pathname = '/auth/magic-link';
          const redirectUrl = urlObj.toString();
          
          console.log("🔗 Modified redirect URL:", redirectUrl);
          
          try {
            if (magicLinkService) {
              console.log("📧 Sending magic link via email service");
              await magicLinkService.sendMagicLink({
                email,
                url: redirectUrl,
                productName: "Gently",
              });
              console.log("✅ Magic link sent successfully to:", email);
            } else {
              // Fallback for development or missing email config
              console.log(
                "⚠️ Email service not configured - using console fallback",
              );
              console.log(`🔗 Magic link for ${email}: ${url}`);
              console.warn(
                "Email service not configured. Using console fallback.",
              );
            }
          } catch (error) {
            console.error("❌ Failed to send magic link:", {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              email,
              url,
            });
            throw error;
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
