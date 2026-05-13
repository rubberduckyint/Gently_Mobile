import { Pressable, Text, View } from "react-native";

import { tokens } from "~/styles/tokens";
import { typographyV2 } from "~/styles/typographyV2";

interface Option<T> {
  value: T;
  label: string;
  sub?: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: Option<T>[];
  disabled?: boolean;
}

export function Segmented<T extends string>({ value, onChange, options, disabled = false }: Props<T>) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: "rgba(12,20,28,0.04)",
        borderRadius: tokens.radius.list,
        padding: 6,
        opacity: disabled ? 0.5 : 1,
      }}
      accessibilityRole="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            // 140ms matches the design spec for segment switch
            style={[
              {
                flex: 1,
                minHeight: 44,
                borderRadius: tokens.radius.list - 4,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
                paddingHorizontal: 4,
                backgroundColor: active ? tokens.color.card : "transparent",
              },
              active && tokens.shadow.card,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
          >
            <Text
              style={[
                typographyV2.body,
                {
                  color: active ? tokens.color.inkH : tokens.color.ink2,
                  fontWeight: active ? "600" : "400",
                  textAlign: "center",
                },
              ]}
            >
              {opt.label}
            </Text>
            {opt.sub && (
              <Text
                style={[
                  typographyV2.eyebrow,
                  {
                    color: active ? tokens.color.ink2 : tokens.color.ink3,
                    marginTop: 1,
                    letterSpacing: 0,
                    textTransform: "none",
                  },
                ]}
              >
                {opt.sub}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
