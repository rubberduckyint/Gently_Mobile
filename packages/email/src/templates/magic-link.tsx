import * as React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

export interface MagicLinkEmailProps {
  email: string;
  url: string;
  productName?: string;
}

export default function MagicLinkEmail({
  email,
  url,
  productName = "Gently",
}: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Sign in to {productName} - Verification Required</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Welcome to {productName}!</Text>
            <Text style={text}>
              We received a request to sign you in to your {productName} account using
              the email address <strong>{email}</strong>.
            </Text>
            <Text style={text}>
              {productName} is your personal vibration and light notification device that
              you wear on your wrist. Use this app to manage your custom alarms
              and notifications.
            </Text>
            <Button href={url} style={button}>
              Complete Sign In
            </Button>
            <Text style={text}>
              This link will expire in 24 hours for your security.
            </Text>
            <Hr style={hr} />
            <Text style={disclaimer}>
              If you did not request this sign-in link, please ignore this email.
              Your account remains secure and no further action is required.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
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
  marginBottom: "16px",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#374151",
  marginBottom: "16px",
};

const button = {
  backgroundColor: "#3b82f6",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  lineHeight: "50px",
  padding: "0 20px",
  textAlign: "center" as const,
  textDecoration: "none",
  margin: "24px 0",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "32px 0",
};

const disclaimer = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#6b7280",
  marginTop: "16px",
};
