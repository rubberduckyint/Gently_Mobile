import * as nodemailer from "nodemailer";

import type { EmailConfig, SendEmailOptions } from "./types";
import { EmailConfigSchema, SendEmailSchema } from "./types";

export class EmailSender {
  private transporter: nodemailer.Transporter;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = EmailConfigSchema.parse(config);

    console.log("🔧 Initializing EmailSender with config:", {
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpPort === 465,
      hasUser: !!this.config.smtpUser,
      hasPassword: !!this.config.smtpPassword,
      emailFrom: this.config.emailFrom,
    });

    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpPort === 465, // true for 465, false for other ports
      auth:
        this.config.smtpUser && this.config.smtpPassword
          ? {
              user: this.config.smtpUser,
              pass: this.config.smtpPassword,
            }
          : undefined,
      // Add TLS options for better compatibility
      tls: {
        // Do not fail on invalid certs (useful for development)
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
      logger: process.env.NODE_ENV !== "production",
      debug: process.env.NODE_ENV !== "production",
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const validatedOptions = SendEmailSchema.parse(options);

    console.log("📧 Attempting to send email:", {
      to: validatedOptions.to,
      subject: validatedOptions.subject,
      from: this.config.emailFrom,
      hasText: !!validatedOptions.text,
      hasHtml: !!validatedOptions.html,
    });

    try {
      const info = await this.transporter.sendMail({
        from: this.config.emailFrom,
        to: validatedOptions.to,
        subject: validatedOptions.subject,
        text: validatedOptions.text,
        html: validatedOptions.html,
      });

      console.log("✅ Email sent successfully:", {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        subject: validatedOptions.subject,
        to: Array.isArray(validatedOptions.to)
          ? validatedOptions.to.join(", ")
          : validatedOptions.to,
      });
    } catch (error) {
      console.error("❌ Failed to send email:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        subject: validatedOptions.subject,
        to: validatedOptions.to,
        emailConfig: {
          host: this.config.smtpHost,
          port: this.config.smtpPort,
          secure: this.config.smtpPort === 465,
          hasAuth: !!this.config.smtpUser,
          from: this.config.emailFrom,
        },
      });

      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log("✅ Email connection verified successfully");
      return true;
    } catch (error) {
      console.error("❌ Email connection verification failed:", error);
      return false;
    }
  }
}
