import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { View } from "react-native";

import { tokens } from "~/styles/tokens";

interface Props {
  current: 0 | 1;
}

// 200ms matches the design spec for step transition
const DURATION = 200;

export function StepIndicator({ current }: Props) {
  const dot0Style = useAnimatedStyle(() => ({
    width: withTiming(current === 0 ? 22 : 6, { duration: DURATION }),
    backgroundColor: withTiming(
      current === 0 ? tokens.color.cyanDeep : "rgba(12,20,28,0.12)",
      { duration: DURATION },
    ),
  }));

  const dot1Style = useAnimatedStyle(() => ({
    width: withTiming(current === 1 ? 22 : 6, { duration: DURATION }),
    backgroundColor: withTiming(
      current === 1 ? tokens.color.cyanDeep : "rgba(12,20,28,0.12)",
      { duration: DURATION },
    ),
  }));

  return (
    <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
      <Animated.View style={[{ height: 6, borderRadius: tokens.radius.pill }, dot0Style]} />
      <Animated.View style={[{ height: 6, borderRadius: tokens.radius.pill }, dot1Style]} />
    </View>
  );
}
