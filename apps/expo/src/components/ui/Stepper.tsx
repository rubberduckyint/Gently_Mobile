import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { tokens } from "~/styles/tokens";
import { typographyV2 } from "~/styles/typographyV2";

interface Props {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  children?: ReactNode;
}

function StepButton({
  label,
  onPress,
  isDisabled,
}: {
  label: string;
  onPress: () => void;
  isDisabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: tokens.color.bgDeep,
        alignItems: "center",
        justifyContent: "center",
        opacity: isDisabled ? 0.4 : pressed ? 0.7 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
    >
      <Text style={[typographyV2.body, { color: tokens.color.inkH, fontSize: 22, lineHeight: 24 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, disabled = false, children }: Props) {
  const atMin = value <= min;
  const atMax = value >= max;

  const decrement = () => {
    if (!atMin) onChange(Math.max(min, value - step));
  };

  const increment = () => {
    if (!atMax) onChange(Math.min(max, value + step));
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <StepButton label="−" onPress={decrement} isDisabled={disabled || atMin} />

      {children ?? (
        <Text
          style={[typographyV2.body, { color: tokens.color.inkH, minWidth: 40, textAlign: "center" }]}
        >
          {value}
        </Text>
      )}

      <StepButton label="+" onPress={increment} isDisabled={disabled || atMax} />
    </View>
  );
}
