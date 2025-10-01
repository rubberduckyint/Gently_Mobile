import nodemailer from "nodemailer";

import { env } from "~/env";

interface SendMailProps {
  recipient: string | string[];
  subject: string;
  html: string | Promise<string>;
  contentText: string;
}

const transporter = nodemailer.createTransport({
  host: env.EMAIL_SERVER_HOST,
  port: Number(env.EMAIL_SERVER_PORT),
  secure: Number(env.EMAIL_SERVER_PORT) === 465, // true for 465, false for other ports
  auth:
    env.EMAIL_SERVER_HOST === "localhost"
      ? undefined
      : env.EMAIL_SERVER_USER
        ? {
            user: env.EMAIL_SERVER_USER,
            pass: env.EMAIL_SERVER_PASSWORD,
          }
        : undefined,
  // Add TLS options for better compatibility with AWS SES
  tls: {
    // Do not fail on invalid certs (useful for development)
    rejectUnauthorized: env.NODE_ENV === "production",
    // Additional options for AWS SES
    ciphers: "SSLv3",
  },
});

/**
 * Send an email using nodemailer
 * @param options Email options including recipient, subject, and content
 * @returns Promise that resolves when email is sent
 * @throws Error if email sending fails
 */
const sendMail = async ({
  recipient,
  subject,
  html,
  contentText,
}: SendMailProps): Promise<void> => {
  try {
    // Validate recipient
    if (!recipient || (Array.isArray(recipient) && recipient.length === 0)) {
      throw new Error("No recipients specified for email");
    }

    // Resolve the html if it's a Promise
    const resolvedHtml = typeof html === "string" ? html : await html;

    // Send the email
    const info = await transporter.sendMail({
      to: recipient,
      from: env.EMAIL_FROM,
      subject: subject,
      text: contentText,
      html: resolvedHtml,
    });

    // Check if the email was sent successfully
    if (!info.messageId) {
      throw new Error(
        "Nodemailer did not return a valid SentMessageInfo object",
      );
    }

    if (env.NODE_ENV !== "production") {
      console.log(`Email sent successfully: ${info.messageId}`, {
        subject,
        recipient: Array.isArray(recipient) ? recipient.join(", ") : recipient,
      });
    }
  } catch (error: unknown) {
    // Enhanced error logging with more details
    const errorDetails = {
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof Error && "code" in error ? error.code : undefined,
      command:
        error instanceof Error && "command" in error
          ? error.command
          : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      subject,
      recipient: Array.isArray(recipient) ? recipient.join(", ") : recipient,
      emailConfig: {
        host: env.EMAIL_SERVER_HOST,
        port: env.EMAIL_SERVER_PORT,
        secure: Number(env.EMAIL_SERVER_PORT) === 465,
        hasAuth: !!env.EMAIL_SERVER_USER,
      },
    };

    console.error("Failed to send email", errorDetails);

    // Rethrow for the caller to handle
    throw error;
  }
};

export default sendMail;
