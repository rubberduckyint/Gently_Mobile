import type { Peripheral } from "react-native-ble-manager";
import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { AdvertisementData } from "~/services/ble/types";
import { Bracelet } from "~/components/brand/Bracelet";
import { GentlyHeader } from "~/components/brand/GentlyHeader";
import { StepIndicator } from "~/components/ui/StepIndicator";
import { useBLE } from "~/contexts/BLEContext";
import { tokens } from "~/styles/tokens";
import { typographyV2 } from "~/styles/typographyV2";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import {
  getSimulatedDeviceData,
  isTestUserSession,
} from "~/utils/testMode";

type PairState = "instruct" | "scanning" | "discovered" | "success";

interface DiscoveredDevice {
  peripheral: Peripheral;
  serialNumber: string;
  displayName: string;
  batteryLevel: number;
}

export default function PairBraceletScreen() {
  const ble = useBLE();
  const { data: session } = authClient.useSession();
  const isTestUser = isTestUserSession(session?.user?.email);
  const queryClient = useQueryClient();

  const [pairState, setPairState] = useState<PairState>("instruct");
  const [discovered, setDiscovered] = useState<DiscoveredDevice | null>(null);
  const isMountedRef = useRef(true);

  const createDevice = useMutation({
    mutationFn: (input: {
      serialNumber: string;
      title: string;
      batteryLevel: number;
    }) =>
      trpc.device.create.mutate({
        title: input.title,
        description: "",
        serialNumber: input.serialNumber,
        batteryLevel: input.batteryLevel,
        firmwareVersion: "1.0.0",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["device", "getAll"] });
    },
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Auto-start scan on mount
  useEffect(() => {
    void startScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScan = async () => {
    if (!isMountedRef.current) return;
    setPairState("scanning");

    try {
      let foundFirst = false;

      // 30s timeout; we stop processing after the first Gently device
      await ble.scanForDevices((peripheral, advertisementData) => {
        if (foundFirst || !isMountedRef.current) return;
        foundFirst = true;

        let serialNumber: string;
        let batteryLevel: number;

        if (advertisementData && typeof advertisementData === "object") {
          const adData = advertisementData as AdvertisementData;
          serialNumber = adData.serialNumber;
          batteryLevel = adData.batteryLevel;
        } else if (isTestUser) {
          // Mock scan passes no advertisement data — fall back to simulated values
          const sim = getSimulatedDeviceData();
          serialNumber = sim.serialNumber;
          batteryLevel = sim.batteryLevel;
        } else {
          // Real device with no advertisement data — skip
          return;
        }

        if (!isMountedRef.current) return;

        setDiscovered({
          peripheral,
          serialNumber,
          batteryLevel,
          displayName: peripheral.name ?? "Gently bracelet",
        });
        setPairState("discovered");
      }, 30);

      // Scan completed without finding a device → show timeout copy
      if (!foundFirst && isMountedRef.current) {
        Alert.alert(
          "No bracelet found",
          "Make sure your bracelet's light is flashing blue. Tap to try again.",
          [{ text: "Try Again", onPress: resetToInstruct }],
        );
        if (isMountedRef.current) setPairState("instruct");
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Scan Error",
        error instanceof Error ? error.message : "Failed to scan. Try again.",
        [{ text: "OK", onPress: resetToInstruct }],
      );
      setPairState("instruct");
    }
  };

  const resetToInstruct = () => {
    setDiscovered(null);
    setPairState("instruct");
  };

  // Trigger connect once we enter "discovered"
  useEffect(() => {
    if (pairState !== "discovered" || !discovered) return;

    // Small delay so user sees the device-found card before connection kicks off
    const id = setTimeout(() => {
      void connectDevice(discovered);
    }, 500);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairState]);

  const connectDevice = async (device: DiscoveredDevice) => {
    try {
      await ble.connectToPeripheral(
        device.peripheral,
        device.serialNumber,
        undefined,
        {
          maxRetries: 3,
          connectionTimeoutMs: 60000,
          stabilizationDelayMs: 900,
          mtuSize: 512,
          scanTimeoutSeconds: 30,
        },
      );

      if (!isMountedRef.current) return;

      await createDevice.mutateAsync({
        serialNumber: device.serialNumber,
        title: "My Gently",
        batteryLevel: device.batteryLevel,
      });

      if (!isMountedRef.current) return;
      setPairState("success");
    } catch (error) {
      if (!isMountedRef.current) return;
      const msg =
        error instanceof Error ? error.message : "Connection failed. Try again.";
      Alert.alert("Connection Failed", msg, [
        { text: "Try Again", onPress: () => { resetToInstruct(); void startScan(); } },
        { text: "Cancel", onPress: resetToInstruct },
      ]);
      setPairState("instruct");
    }
  };

  // Auto-advance to connect-dexcom after success
  useEffect(() => {
    if (pairState !== "success") return;
    // ~1s delay gives user a moment to see the success state
    const id = setTimeout(() => {
      if (isMountedRef.current) {
        router.replace("/(onboarding)/connect-dexcom");
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [pairState]);

  const headingText: Record<PairState, string> = {
    instruct: "Pair your bracelet",
    scanning: "Looking for your bracelet…",
    discovered: "Found your bracelet",
    success: "Connected",
  };

  const subtitleText: Record<PairState, string> = {
    instruct: "Keep your bracelet nearby with its light flashing blue.",
    scanning: "Scanning for Gently devices…",
    discovered: discovered
      ? `Found ${discovered.displayName}. Connecting…`
      : "Connecting to your bracelet…",
    success: "Your bracelet is paired and ready.",
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.bg }}
      edges={["top", "bottom"]}
    >
      <GentlyHeader />

      <View style={{ alignItems: "center", marginTop: 10, marginBottom: 20 }}>
        <StepIndicator current={0} />
      </View>

      {/* Bracelet illustration — centred in remaining space */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Bracelet state={pairState} size={240} />

        <Text
          style={[
            typographyV2.h1Onboarding,
            {
              color: tokens.color.inkH,
              textAlign: "center",
              marginTop: 32,
              marginBottom: 10,
            },
          ]}
        >
          {headingText[pairState]}
        </Text>

        <Text
          style={[
            typographyV2.body,
            {
              color: tokens.color.ink2,
              textAlign: "center",
              lineHeight: 22,
              paddingHorizontal: 8,
            },
          ]}
        >
          {subtitleText[pairState]}
        </Text>

        {/* Tip card — instruct state only */}
        {pairState === "instruct" && (
          <View
            style={{
              marginTop: 28,
              backgroundColor: tokens.color.cyanBg,
              borderRadius: tokens.radius.card,
              paddingVertical: 14,
              paddingHorizontal: 18,
              width: "100%",
            }}
          >
            <Text
              style={[
                typographyV2.eyebrow,
                { color: tokens.color.cyanDeep, marginBottom: 4 },
              ]}
            >
              Tip
            </Text>
            <Text
              style={[typographyV2.body, { color: tokens.color.ink, lineHeight: 21 }]}
            >
              Make sure your bracelet's light is flashing blue.
            </Text>
          </View>
        )}

        {/* Device card — discovered state only */}
        {pairState === "discovered" && discovered && (
          <View
            style={{
              marginTop: 24,
              backgroundColor: tokens.color.card,
              borderRadius: tokens.radius.card,
              paddingVertical: 14,
              paddingHorizontal: 18,
              width: "100%",
              ...tokens.shadow.card,
            }}
          >
            <Text
              style={[
                typographyV2.eyebrow,
                { color: tokens.color.ink3, marginBottom: 4 },
              ]}
            >
              Device found
            </Text>
            <Text
              style={[typographyV2.body, { color: tokens.color.inkH, fontWeight: "600" }]}
            >
              {discovered.displayName}
            </Text>
            <Text
              style={[
                typographyV2.body,
                { color: tokens.color.ink3, fontSize: 13, marginTop: 2 },
              ]}
            >
              {discovered.serialNumber}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
