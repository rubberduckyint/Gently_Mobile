import * as React from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface OTPEmailProps {
  email: string;
  otp: string;
  productName?: string;
}

export default function OTPEmail({
  email,
  otp,
  productName = "Gently",
}: OTPEmailProps) {
  const title = "Sign in to your account";
  const description = `Use this code to sign in to your ${productName} account:`;

  return (
    <Html>
      <Head />
      <Preview>
        {title} - {productName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>{title}</Text>
            <Text style={text}>{description}</Text>
            <Text style={text}>
              <strong>Email:</strong> {email}
            </Text>
            <Section style={codeContainer}>
              <Text style={code}>{otp}</Text>
            </Section>
            <Text style={text}>
              This code will expire in 5 minutes for your security.
            </Text>
            <Hr style={hr} />
            <Text style={disclaimer}>
              If you did not request this code, please ignore this email or
              contact support if you have concerns.
            </Text>
            <Text style={footer}>
              {productName} - Your personal vibration and light notification
              device
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const section = {
  padding: "0 48px",
};

const heading = {
  fontSize: "28px",
  fontWeight: "bold",
  color: "#1f2937",
  margin: "40px 0 20px",
  textAlign: "center" as const,
};

const text = {
  fontSize: "16px",
  color: "#374151",
  lineHeight: "24px",
  margin: "16px 0",
};

const codeContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
  padding: "20px",
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
};

const code = {
  fontSize: "32px",
  fontWeight: "bold",
  color: "#1f2937",
  fontFamily: "monospace",
  letterSpacing: "4px",
  padding: "16px 24px",
  backgroundColor: "#ffffff",
  borderRadius: "4px",
  border: "2px solid #e5e7eb",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "32px 0",
};

const disclaimer = {
  fontSize: "14px",
  color: "#6b7280",
  lineHeight: "20px",
  margin: "16px 0",
};

const footer = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  margin: "24px 0 0",
};
