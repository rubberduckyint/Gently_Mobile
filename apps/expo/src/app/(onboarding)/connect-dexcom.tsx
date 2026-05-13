import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Line } from "react-native-svg";

import { Check, Cloud } from "~/components/icons";
import { GentlyHeader } from "~/components/brand/GentlyHeader";
import { GentlyMark } from "~/components/brand/GentlyMark";
import { StepIndicator } from "~/components/ui/StepIndicator";
import { tokens } from "~/styles/tokens";
import { typographyV2 } from "~/styles/typographyV2";

export default function ConnectDexcomHeroScreen() {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.bg }}
      edges={["top", "bottom"]}
    >
      <GentlyHeader />

      <View style={{ alignItems: "center", marginTop: 10, marginBottom: 6 }}>
        <StepIndicator current={1} />
      </View>

      {/* "Bracelet paired" confirmation chip */}
      <View style={{ alignItems: "center", marginTop: 14 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: tokens.radius.pill,
            backgroundColor: tokens.color.cyanBg,
          }}
        >
          <Check size={14} color={tokens.color.cyanDeep} strokeWidth={2.4} />
          <Text
            style={{
              ...typographyV2.body,
              fontSize: 12,
              fontWeight: "600",
              color: tokens.color.cyanDeep,
            }}
          >
            Bracelet paired
          </Text>
        </View>
      </View>

      {/* Hero area — vertically centered */}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 28,
          marginTop: -30,
        }}
      >
        {/* Connection diagram: GentlyMark ⟶ dashed line ⟶ Cloud */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 20,
            marginBottom: 28,
          }}
        >
          {/* Left node — Gently mark */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: tokens.color.card,
              alignItems: "center",
              justifyContent: "center",
              ...tokens.shadow.card,
            }}
          >
            <GentlyMark size={28} />
          </View>

          {/* Dashed connector */}
          <Svg width={56} height={2} viewBox="0 0 56 2">
            <Line
              x1={0}
              y1={1}
              x2={56}
              y2={1}
              stroke={tokens.color.cyan}
              strokeWidth={2}
              strokeDasharray="4,4"
            />
          </Svg>

          {/* Right node — Cloud icon (glow ring per design) */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: tokens.color.card,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: tokens.color.cyan,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.18,
              shadowRadius: 18,
              elevation: 3,
              // inner ring approximated via border
              borderWidth: 1,
              borderColor: "rgba(22,188,233,0.4)",
            }}
          >
            <Cloud size={28} color={tokens.color.cyanDeep} strokeWidth={1.8} />
          </View>
        </View>

        <Text
          style={[
            typographyV2.h1Onboarding,
            {
              color: tokens.color.inkH,
              textAlign: "center",
              marginBottom: 12,
            },
          ]}
        >
          One more step
        </Text>

        <Text
          style={[
            typographyV2.body,
            {
              color: tokens.color.ink2,
              textAlign: "center",
              lineHeight: 22,
              maxWidth: 300,
            },
          ]}
        >
          Connect your Dexcom Share account so Gently can keep watch for you.
        </Text>
      </View>

      {/* Bottom CTA area */}
      <View style={{ paddingHorizontal: 22, paddingBottom: 24 }}>
        <Pressable
          style={{
            backgroundColor: tokens.color.cyan,
            borderRadius: tokens.radius.cta,
            paddingVertical: 16,
            alignItems: "center",
            ...tokens.shadow.primary,
          }}
          onPress={() => router.push("/cgm/add")}
        >
          <Text
            style={{
              ...typographyV2.body,
              fontSize: 16,
              fontWeight: "600",
              color: "#fff",
            }}
          >
            Connect Dexcom Share
          </Text>
        </Pressable>

        <Text
          style={{
            ...typographyV2.body,
            fontSize: 11.5,
            color: tokens.color.ink3,
            textAlign: "center",
            marginTop: 14,
            lineHeight: 18,
          }}
        >
          {"You'll sign in with your Dexcom Share credentials.\nGently never sees your readings without your consent."}
        </Text>
      </View>
    </SafeAreaView>
  );
}
