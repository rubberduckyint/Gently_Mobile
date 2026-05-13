import { useRef } from "react";
import { Pressable, Text, View } from "react-native";

import { tokens } from "~/styles/tokens";
import { typography } from "~/styles";

const LED_COLORS = [
  { id: "blue", label: "Blue", swatch: tokens.color.led.blue },
  { id: "green", label: "Green", swatch: tokens.color.led.green },
  { id: "cyan", label: "Cyan", swatch: tokens.color.led.cyan },
  { id: "red", label: "Red", swatch: tokens.color.led.red },
  { id: "yellow", label: "Yellow", swatch: tokens.color.led.yellow },
  { id: "magenta", label: "Magenta", swatch: tokens.color.led.magenta },
  { id: "white", label: "White", swatch: tokens.color.led.white },
] as const;

export interface LightColorPickerProps {
  value: string | null;
  onChange: (next: string | null) => void;
}

export function LightColorPicker({ value, onChange }: LightColorPickerProps) {
  // Preserve last-selected color so "Turn on" restores it instead of defaulting cold
  const lastColorRef = useRef<string>(
    value !== null ? value.toLowerCase() : "blue",
  );

  const isOff = value === null;
  // Case-insensitive match: "Red" from legacy DB rows highlights the red swatch
  const normalizedValue = value?.toLowerCase() ?? null;

  function handleToggle() {
    if (isOff) {
      onChange(lastColorRef.current);
    } else {
      onChange(null);
    }
  }

  function handleSelectColor(id: string) {
    lastColorRef.current = id;
    onChange(id);
  }

  const selectedLabel = isOff
    ? "Off"
    : (LED_COLORS.find((c) => c.id === normalizedValue)?.label ?? value);

  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text
          style={[
            typography.label,
            { color: tokens.color.ink3, letterSpacing: 0.8, fontSize: 11 },
          ]}
        >
          LIGHT COLOR
        </Text>
        <Pressable onPress={handleToggle} accessibilityRole="button">
          <Text
            style={[
              typography.label,
              { color: tokens.color.cyan, fontWeight: "600" },
            ]}
          >
            {isOff ? "Turn on" : "Turn off"}
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
          opacity: isOff ? 0.4 : 1,
        }}
      >
        {LED_COLORS.map(({ id, label, swatch }) => {
          const selected = normalizedValue === id;
          return (
            <Pressable
              key={id}
              onPress={() => handleSelectColor(id)}
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: swatch,
                alignItems: "center",
                justifyContent: "center",
                // Selected: inner white ring + outer accent ring
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? "#FFFFFF" : "transparent",
                // Outer accent ring via shadow on selected
                ...(selected
                  ? {
                      shadowColor: swatch,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 1,
                      shadowRadius: 4,
                      elevation: 6,
                      transform: [{ scale: 1.02 }],
                    }
                  : {
                      shadowColor: "#0C141C",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.12,
                      shadowRadius: 2,
                      elevation: 1,
                    }),
              }}
            >
              {selected && (
                <Text
                  style={{
                    fontSize: 18,
                    color: "#FFFFFF",
                    fontWeight: "700",
                    lineHeight: 22,
                  }}
                >
                  ✓
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <Text
        style={[
          typography.caption,
          { color: tokens.color.ink3, marginTop: 6 },
        ]}
      >
        {"Selected: "}
        <Text style={{ fontWeight: "600", color: tokens.color.ink2 }}>
          {selectedLabel}
        </Text>
      </Text>
    </View>
  );
}
