import { render } from "@react-email/render";
import type { EmailSender } from "./sender";
import type { MagicLinkEmailOptions } from "./types";
import { MagicLinkEmailSchema } from "./types";
import MagicLinkEmail from "./templates/magic-link";

export class MagicLinkService {
  constructor(private emailSender: EmailSender) {}

  async sendMagicLink(options: MagicLinkEmailOptions): Promise<void> {
    const validatedOptions = MagicLinkEmailSchema.parse(options);
    
    const html = await render(
      MagicLinkEmail({
        email: validatedOptions.email,
        url: validatedOptions.url,
        productName: validatedOptions.productName,
      })
    );

    const text = this.generatePlainText(validatedOptions);

    await this.emailSender.sendEmail({
      to: validatedOptions.email,
      subject: `Complete your sign in to ${validatedOptions.productName}`,
      html,
      text,
    });
  }

  private generatePlainText(options: MagicLinkEmailOptions): string {
    return `
Welcome to ${options.productName}!

We received a request to sign you in to your ${options.productName} account using ${options.email}.

${options.productName} is your personal vibration and light notification device. Use this app to manage your custom alarms and notifications.

Complete your sign in: ${options.url}

This link will expire in 24 hours for your security.

If you did not request this sign-in link, please ignore this email.
    `.trim();
  }
}
