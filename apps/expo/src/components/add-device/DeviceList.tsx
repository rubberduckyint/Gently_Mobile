import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  buttons,
  buttonText,
  cards,
  colors,
  spacing,
  typography,
} from "~/styles";

export interface DeviceListItem {
  peripheralId: string;
  name: string | null;
  serialNumber: string | null;
  rssi: number;
  batteryLevel?: number;
  keyType?: string | null;
  isPaired: boolean;
  isConnecting: boolean;
}

interface DeviceListProps {
  devices: DeviceListItem[];
  onConnect: (device: DeviceListItem) => void;
}

export function DeviceList({ devices, onConnect }: DeviceListProps) {
  if (devices.length === 0) {
    return null;
  }

  return (
    <ScrollView
      style={{
        width: "100%",
        maxHeight: 400,
        marginBottom: spacing[6],
      }}
      showsVerticalScrollIndicator={false}
    >
      {devices.map((device) => {
        const isDisabled = device.isPaired || device.isConnecting;

        return (
          <View
            key={device.peripheralId}
            style={[
              cards.base,
              cards.interactive,
              { marginBottom: spacing[3] },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: spacing[3],
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.h6, { marginBottom: spacing[1] }]}>
                  {device.name ?? "Unknown Device"}
                </Text>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginBottom: spacing[1] },
                  ]}
                >
                  ID: {device.peripheralId}
                </Text>
                <Text
                  style={[typography.caption, { color: colors.text.secondary }]}
                >
                  Signal: {device.rssi} dBm
                </Text>

                <View style={{ marginTop: spacing[2] }}>
                  <Text
                    style={[typography.caption, { color: colors.primary[600] }]}
                  >
                    Serial: {device.serialNumber ?? "Unknown"}
                  </Text>

                  <Text
                    style={[
                      typography.caption,
                      {
                        color:
                          device.keyType === "factory"
                            ? colors.success[600]
                            : colors.warning[600],
                        marginTop: spacing[1],
                        fontWeight: "600",
                      },
                    ]}
                  >
                    {device.keyType === "factory"
                      ? "📦 Factory mode — ready to pair"
                      : "🔑 Custom key — can re-pair"}
                  </Text>

                  {device.batteryLevel !== undefined && (
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.text.secondary,
                          marginTop: spacing[1],
                        },
                      ]}
                    >
                      {`🔋 Battery: Level ${device.batteryLevel}`}
                    </Text>
                  )}

                  {device.isPaired && (
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.text.secondary,
                          marginTop: spacing[1],
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {"✅ Already paired with your account"}
                    </Text>
                  )}
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isDisabled}
                onPress={() => onConnect(device)}
                style={[
                  buttons.base,
                  buttons.small,
                  isDisabled ? buttons.disabled : buttons.primary,
                  { alignSelf: "center" },
                ]}
              >
                <Text style={[buttonText.primary]}>
                  {device.isPaired
                    ? "Paired"
                    : device.isConnecting
                      ? "Connecting..."
                      : "Connect"}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
