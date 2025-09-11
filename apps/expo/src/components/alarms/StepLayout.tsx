import React from "react";
import { ScrollView, Text, View } from "react-native";

import { colors, flex, spacing, typography } from "~/styles";

interface StepLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  navigation?: React.ReactNode;
}

export function StepLayout({
  title,
  subtitle,
  children,
  navigation,
}: StepLayoutProps) {
  return (
    <View style={[flex.flex1, { backgroundColor: colors.background.primary }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing[6],
          paddingBottom: navigation ? spacing[4] : spacing[6],
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[typography.h2, { marginBottom: spacing[2] }]}>
          {title}
        </Text>
        {subtitle && (
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, marginBottom: spacing[6] },
            ]}
          >
            {subtitle}
          </Text>
        )}
        {children}
      </ScrollView>

      {/* Navigation area outside of scroll */}
      {navigation && (
        <View
          style={{
            padding: spacing[6],
            paddingTop: spacing[4],
            borderTopWidth: 1,
            borderTopColor: colors.border.light,
            backgroundColor: colors.background.primary,
          }}
        >
          {navigation}
        </View>
      )}
    </View>
  );
}
