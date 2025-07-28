import * as nodemailer from "nodemailer";
import type { EmailConfig, SendEmailOptions } from "./types";
import { EmailConfigSchema, SendEmailSchema } from "./types";

export class EmailSender {
  private transporter: nodemailer.Transporter;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = EmailConfigSchema.parse(config);
    
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpPort === 465, // true for 465, false for other ports
      auth: this.config.smtpUser && this.config.smtpPassword ? {
        user: this.config.smtpUser,
        pass: this.config.smtpPassword,
      } : undefined,
      // Add TLS options for better compatibility
      tls: {
        // Do not fail on invalid certs (useful for development)
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const validatedOptions = SendEmailSchema.parse(options);
    
    try {
      const info = await this.transporter.sendMail({
        from: this.config.emailFrom,
        to: validatedOptions.to,
        subject: validatedOptions.subject,
        text: validatedOptions.text,
        html: validatedOptions.html,
      });

      if (process.env.NODE_ENV !== "production") {
        console.log(`Email sent successfully: ${info.messageId}`, {
          subject: validatedOptions.subject,
          to: Array.isArray(validatedOptions.to) ? validatedOptions.to.join(", ") : validatedOptions.to,
        });
      }
    } catch (error) {
      console.error("Failed to send email", {
        error: error instanceof Error ? error.message : String(error),
        subject: validatedOptions.subject,
        to: validatedOptions.to,
        emailConfig: {
          host: this.config.smtpHost,
          port: this.config.smtpPort,
          secure: this.config.smtpPort === 465,
          hasAuth: !!this.config.smtpUser,
        },
      });
      
      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("Email connection verification failed:", error);
      return false;
    }
  }
}
