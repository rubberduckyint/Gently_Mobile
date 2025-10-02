import { z } from "zod/v4";

export const EmailConfigSchema = z.object({
  smtpHost: z.string(),
  smtpPort: z.coerce.number(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  emailFrom: z.string(),
});

export type EmailConfig = z.infer<typeof EmailConfigSchema>;

export const SendEmailSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  subject: z.string().min(1),
  text: z.string(),
  html: z.string(),
});

export type SendEmailOptions = z.infer<typeof SendEmailSchema>;

export const MagicLinkEmailSchema = z.object({
  email: z.string(),
  url: z.string().url(),
  productName: z.string().default("Gently"),
});

export type MagicLinkEmailOptions = z.infer<typeof MagicLinkEmailSchema>;
