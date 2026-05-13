import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { tokens } from "~/styles/tokens";
import { typographyV2 } from "~/styles/typographyV2";

interface Props {
  icon: ReactNode;
  label: string;
  value: string;
  accentColor?: string;
  dot?: { color: string };
}

export function StatusPill({
  icon,
  label,
  value,
  accentColor = tokens.color.cyanDeep,
  dot,
}: Props) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: tokens.color.card,
          borderRadius: tokens.radius.list,
          paddingHorizontal: tokens.spacing.cardInternal,
          paddingVertical: 12,
        },
        tokens.shadow.card,
      ]}
    >
      <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
        {icon}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[typographyV2.eyebrow, { color: accentColor }]}>{label}</Text>
        <Text style={[typographyV2.body, { color: tokens.color.ink, marginTop: 1 }]}>{value}</Text>
      </View>

      {dot && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: dot.color,
            shadowColor: dot.color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 4,
            elevation: 2,
          }}
        />
      )}
    </View>
  );
}
