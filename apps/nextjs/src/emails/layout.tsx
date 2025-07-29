import * as React from "react";
import {
  Body,
  Container,
  Column,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Img,
  Row,
} from "@react-email/components";
import {
  bodyStyle,
  containerStyle,
  footerStyle,
  footerTextStyle,
  headerStyle,
} from "./styles";
import { env } from "~/env";

interface LayoutProps {
  preview?: string;
  children: React.ReactNode;
}

export default function Layout({
  preview = "Gently Email",
  children,
}: LayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Row style={{ textAlign: "center" }}>
              <Column style={{ textAlign: "center" }}>
                <Img
                  src={`${env.NEXT_PUBLIC_BASE_URL}/images/logo-dark.png`}
                  alt="Gently Logo"
                  width="150"
                  height="40"
                  style={{ margin: "0 auto", display: "block" }}
                />
              </Column>
            </Row>
          </Section>

          {children}

          <Section style={footerStyle}>
            <Column>
              <Text style={footerTextStyle}>
                © {new Date().getFullYear()} Gently
              </Text>
            </Column>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
