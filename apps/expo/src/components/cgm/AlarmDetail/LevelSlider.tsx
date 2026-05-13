import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { tokens } from "~/styles/tokens";
import { tabularNums, typographyV2 } from "~/styles/typographyV2";

interface LevelSliderProps {
  value: number;
  onChange: (next: number) => void;
  labels: [string, string, string, string, string];
  accent: string;
  readOut?: { value: string; label: string };
}

const KNOB_SIZE = 26;
const KNOB_RADIUS = KNOB_SIZE / 2;
const TRACK_HEIGHT = 8;
const INNER_DOT = 8;
// Tick at indices 1, 2, 3 (not the edges)
const TICK_INDICES = [1, 2, 3] as const;

export function LevelSlider({
  value,
  onChange,
  labels,
  accent,
  readOut,
}: LevelSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  // usable = track container width minus knob so knob stays fully inside
  const usableWidth = trackWidth - KNOB_SIZE;

  const knobX = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Sync external value → animated knobX when not dragging
  // Runs whenever value or trackWidth changes; guard avoids animation before layout
  if (!isDragging.value && trackWidth > 0) {
    const target = (value / 4) * usableWidth;
    knobX.value = withTiming(target, {
      duration: 140,
      easing: Easing.out(Easing.ease),
    });
  }

  const pan = Gesture.Pan()
    .onBegin(() => {
      isDragging.value = true;
    })
    .onUpdate((e) => {
      // e.x is relative to the GestureDetector container; offset by knob radius
      // so the center of the knob tracks the finger
      const raw = e.x - KNOB_RADIUS;
      knobX.value = Math.max(0, Math.min(usableWidth, raw));
    })
    .onEnd(() => {
      isDragging.value = false;
      const ratio = usableWidth > 0 ? knobX.value / usableWidth : 0;
      const snapped = Math.round(ratio * 4);
      // Snap knob to integer position with 140ms ease
      knobX.value = withTiming((snapped / 4) * usableWidth, {
        duration: 140,
        easing: Easing.out(Easing.ease),
      });
      // runOnJS is required: gesture callbacks execute on the UI thread,
      // calling a React state setter directly would throw
      runOnJS(onChange)(snapped);
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knobX.value }],
  }));

  // Fill covers from left edge to knob center
  const fillStyle = useAnimatedStyle(() => ({
    width: knobX.value + KNOB_RADIUS,
  }));

  return (
    <View>
      {readOut && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
            <Text
              style={[typographyV2.sliderValue, { color: tokens.color.inkH, fontVariant: tabularNums }]}
            >
              {readOut.value}
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: tokens.color.ink3,
              }}
            >
              {" · "}
              {readOut.label}
            </Text>
          </View>
          <Text
            style={{ fontSize: 12, fontWeight: "600", color: tokens.color.ink3 }}
          >
            0 – 4
          </Text>
        </View>
      )}

      <GestureDetector gesture={pan}>
        <View
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          style={{
            height: KNOB_SIZE,
            justifyContent: "center",
          }}
        >
          {/* Track background */}
          <View
            style={{
              height: TRACK_HEIGHT,
              borderRadius: TRACK_HEIGHT / 2,
              backgroundColor: tokens.color.bgDeep,
              overflow: "hidden",
            }}
          />

          {/* Accent fill — absolutely positioned over track */}
          <Animated.View
            style={[
              fillStyle,
              {
                position: "absolute",
                left: 0,
                height: TRACK_HEIGHT,
                borderRadius: TRACK_HEIGHT / 2,
                backgroundColor: accent,
              },
            ]}
          />

          {/* Tick marks at positions 1, 2, 3 */}
          {trackWidth > 0 &&
            TICK_INDICES.map((tickIndex) => {
              const tickCenter = (tickIndex / 4) * usableWidth + KNOB_RADIUS;
              const aboveValue = tickIndex <= value;
              return (
                <View
                  key={tickIndex}
                  style={{
                    position: "absolute",
                    left: tickCenter - 1.5,
                    width: 3,
                    height: TRACK_HEIGHT,
                    borderRadius: 1.5,
                    backgroundColor: aboveValue
                      ? "rgba(255,255,255,0.72)"
                      : "rgba(12,20,28,0.18)",
                  }}
                />
              );
            })}

          {/* Knob: white circle with cyan-deep inner dot */}
          <Animated.View
            style={[
              knobStyle,
              {
                position: "absolute",
                left: 0,
                width: KNOB_SIZE,
                height: KNOB_SIZE,
                borderRadius: KNOB_RADIUS,
                backgroundColor: tokens.color.card,
                alignItems: "center",
                justifyContent: "center",
                ...tokens.shadow.hover,
              },
            ]}
          >
            <View
              style={{
                width: INNER_DOT,
                height: INNER_DOT,
                borderRadius: INNER_DOT / 2,
                backgroundColor: tokens.color.cyanDeep,
              }}
            />
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Label row — 5 tappable buttons evenly spaced */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 12,
        }}
      >
        {labels.map((label, i) => (
          <Pressable
            key={i}
            onPress={() => onChange(i)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: value === i }}
            hitSlop={8}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: value === i ? "700" : "500",
                color: value === i ? accent : tokens.color.ink3,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
