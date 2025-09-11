import React from "react";
import { View } from "react-native";

import { spacing } from "~/styles";

interface StepLayoutProps {
  children: React.ReactNode;
  bottomContent?: React.ReactNode;
}

export function StepLayout({ children, bottomContent }: StepLayoutProps) {
  return (
    <View style={{ flex: 1 }}>
      {/* Main content area that takes available space */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing[5],
          paddingVertical: spacing[8],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </View>

      {/* Bottom button area with consistent positioning */}
      {bottomContent && (
        <View
          style={{
            paddingHorizontal: spacing[5],
            paddingBottom: spacing[6],
            paddingTop: spacing[4],
          }}
        >
          {bottomContent}
        </View>
      )}
    </View>
  );
}
