import * as React from "react";
import { Button, Column, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";

import Layout from "../layout";
import sendMail from "../mailSender";
import {
  buttonStyle,
  contentSectionStyle,
  disclaimerStyle,
  emailHighlightStyle,
  headingStyle,
  textStyle,
} from "../styles";

export interface UserLoginVerificationProps {
  email: string;
  url: string;
}

export default function UserLoginVerification({
  email,
  url,
}: UserLoginVerificationProps) {
  return (
    <Layout preview="Sign in to Gently - Verification Required">
      <Section style={contentSectionStyle}>
        <Column>
          <Text style={headingStyle}>Welcome to Gently!</Text>
          <Text style={textStyle}>
            We received a request to sign you in to your Gently account using
            the email address <span style={emailHighlightStyle}>{email}</span>.
          </Text>
          <Text style={textStyle}>
            Gently is your personal vibration and light notification device that
            you wear on your wrist. Use this app to manage your custom alarms
            and notifications.
          </Text>
          <Button href={url} style={buttonStyle}>
            Complete Sign In
          </Button>
          <Text style={textStyle}>
            This link will expire in 24 hours for your security.
          </Text>
          <Text style={disclaimerStyle}>
            If you did not request this sign-in link, please ignore this email.
            Your account remains secure and no further action is required.
          </Text>
        </Column>
      </Section>
    </Layout>
  );
}

/**
 * Send a verification email with login link
 */
export const sendVerificationEmail = async ({
  identifier: email,
  url,
}: {
  identifier: string;
  url: string;
}): Promise<void> => {
  try {
    await sendMail({
      recipient: email,
      subject: `Complete your sign in to Gently`,
      contentText: `Welcome to Gently!\n\nWe received a request to sign you in to your Gently account using ${email}.\n\nGently is your personal vibration and light notification device. Use this app to manage your custom alarms and notifications.\n\nComplete your sign in: ${url}\n\nThis link will expire in 24 hours for your security.\n\nIf you did not request this sign-in link, please ignore this email.`,
      html: render(<UserLoginVerification email={email} url={url} />),
    });
  } catch (error) {
    console.error("Verification email sending failed", {
      error: error instanceof Error ? error.message : String(error),
      email,
      url,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};
