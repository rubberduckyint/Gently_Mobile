import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { tokens } from "~/styles/tokens";
import { typography } from "~/styles";

// Five sound patterns, in display order. audioLevel column on alert_rule
// stores 0-4; the indices here match SRF's level-translator AUDIO_BY_LEVEL.
export const SOUND_PATTERNS = [
  { id: 0, label: "Off", glyph: "✕" },
  { id: 1, label: "Quick", glyph: "⋯" },
  { id: 2, label: "Long", glyph: "–" },
  { id: 3, label: "Steady", glyph: "▬" },
  { id: 4, label: "Heartbeat", glyph: "♥" },
] as const;

export type SoundPatternId = 0 | 1 | 2 | 3 | 4;

interface SoundPatternPickerProps {
  value: SoundPatternId;
  onChange: (v: SoundPatternId) => void;
  /** Called when user taps a card — used to fire a one-shot preview. */
  onPreview?: (v: SoundPatternId) => void;
}

export function SoundPatternPicker({
  value,
  onChange,
  onPreview,
}: SoundPatternPickerProps) {
  const selectedLabel = useMemo(
    () => SOUND_PATTERNS.find((p) => p.id === value)?.label ?? "Off",
    [value],
  );

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
          SOUND
        </Text>
        <Pressable onPress={() => onChange(0)} accessibilityRole="button">
          <Text
            style={[
              typography.label,
              { color: tokens.color.cyan, fontWeight: "600" },
            ]}
          >
            {value === 0 ? "Off" : "Turn off"}
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {SOUND_PATTERNS.filter((p) => p.id !== 0).map((p) => {
          const selected = p.id === value;
          const off = value === 0;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                onChange(p.id);
                onPreview?.(p.id);
              }}
              accessibilityLabel={p.label}
              accessibilityState={{ selected }}
              style={{
                minWidth: 64,
                height: 56,
                paddingHorizontal: 12,
                borderRadius: 14,
                backgroundColor: tokens.color.card,
                borderWidth: 2,
                borderColor: selected ? tokens.color.cyanDeep : "transparent",
                opacity: off ? 0.4 : 1,
                alignItems: "center",
                justifyContent: "center",
                ...(selected
                  ? {
                      shadowColor: tokens.color.cyanDeep,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.4,
                      shadowRadius: 6,
                      elevation: 4,
                    }
                  : {}),
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  color: selected ? tokens.color.cyanDeep : tokens.color.ink,
                  fontWeight: "600",
                }}
              >
                {p.glyph}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: selected ? tokens.color.cyanDeep : tokens.color.ink2,
                  marginTop: 2,
                }}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={[typography.caption, { color: tokens.color.ink3, marginTop: 6 }]}
      >
        {"Selected: "}
        <Text style={{ fontWeight: "600", color: tokens.color.ink2 }}>
          {selectedLabel}
        </Text>
      </Text>
    </View>
  );
}
