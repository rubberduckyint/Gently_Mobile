import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { BluetoothDevice } from "~/services/bluetooth";
import { cards, colors, spacing, typography } from "~/styles";

interface DeviceListProps {
  devices: BluetoothDevice[];
  onDeviceSelect: (device: BluetoothDevice) => void;
}

export function DeviceList({ devices, onDeviceSelect }: DeviceListProps) {
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
      {devices.map((device) => (
        <Pressable
          key={device.id}
          style={[cards.base, cards.interactive, { marginBottom: spacing[3] }]}
          onPress={() => onDeviceSelect(device)}
        >
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.h6, { marginBottom: spacing[1] }]}>
                {device.name || "Unknown Device"}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.secondary, marginBottom: spacing[1] },
                ]}
              >
                {device.id}
              </Text>
              <Text
                style={[typography.caption, { color: colors.text.secondary }]}
              >
                Signal: {device.rssi} dBm
              </Text>

              {device.manufacturerData?.isGentlyDevice && (
                <View style={{ marginTop: spacing[2] }}>
                  {device.manufacturerData.serialNumber && (
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.primary[600] },
                      ]}
                    >
                      Serial: {device.manufacturerData.serialNumber}
                    </Text>
                  )}
                  {device.manufacturerData.isFactoryMode === true && (
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.success[600],
                          fontWeight: "600",
                          marginTop: spacing[1],
                        },
                      ]}
                    >
                      📦 Factory mode - Ready to pair
                    </Text>
                  )}
                  {device.manufacturerData.isFactoryMode === false && (
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.warning[600],
                          marginTop: spacing[1],
                        },
                      ]}
                    >
                      � Has custom key - Can re-pair
                    </Text>
                  )}
                  {device.manufacturerData.batteryLevel !== undefined && (
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.text.secondary,
                          marginTop: spacing[1],
                        },
                      ]}
                    >
                      🔋 Battery: {device.manufacturerData.batteryLevel}/7
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* Show connect text for all Gently devices */}
            <Text
              style={[typography.labelLarge, { color: colors.primary[600] }]}
            >
              Connect
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
