// Layout styles
export const bodyStyle = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  margin: "0",
  padding: "0",
};

export const containerStyle = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "6px",
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
};

export const headerStyle = {
  backgroundColor: "#EBF8FF",
  padding: "20px 0",
  textAlign: "center" as const,
};

export const contentSectionStyle = {
  padding: "24px",
  textAlign: "center" as const,
};

export const footerStyle = {
  backgroundColor: "#4EB8FF",
  padding: "16px",
  textAlign: "center" as const,
};

// Text styles
export const textStyle = {
  fontSize: "14px",
  color: "#4A5568",
  margin: "12px 0",
  lineHeight: "1.5",
  fontWeight: "400",
};

export const headingStyle = {
  fontSize: "18px",
  fontWeight: "500",
  color: "#4A5568",
  margin: "16px 0",
};

export const footerTextStyle = {
  fontSize: "14px",
  color: "#ffffff",
  margin: "0",
};

export const disclaimerStyle = {
  fontSize: "14px",
  color: "#718096",
  margin: "16px 0 0",
};

// Interactive elements
export const buttonStyle = {
  backgroundColor: "#4EB8FF",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  textDecoration: "none",
  padding: "10px 24px",
  margin: "16px 0",
  display: "inline-block",
};

export const linkStyle = {
  color: "#4EB8FF",
  textDecoration: "underline",
};

// Emphasis styles
export const emailHighlightStyle = {
  fontWeight: "800",
  color: "#4EB8FF",
};

// Content variations
export const centeredContentStyle = {
  ...contentSectionStyle,
  textAlign: "center" as const,
};

export const leftAlignedContentStyle = {
  ...contentSectionStyle,
  textAlign: "left" as const,
};
