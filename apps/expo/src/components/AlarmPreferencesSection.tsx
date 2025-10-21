/**
 * Alarm Preferences Section
 * UI component for managing user's default alarm settings
 */

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  buttons,
  buttonText,
  colors,
  inputs,
  spacing,
  typography,
} from "~/styles";

interface AlarmPreferencesSectionProps {
  severityLevel: "INFORMATIONAL" | "WARNING" | "CRITICAL";
  setSeverityLevel: (
    value: "INFORMATIONAL" | "WARNING" | "CRITICAL",
  ) => void;
  ledPattern: "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE";
  setLedPattern: (
    value: "SOLID" | "BLINK_SLOW" | "BLINK_FAST" | "PULSE" | "STROBE",
  ) => void;
  ledColor: "RED" | "GREEN" | "BLUE" | "YELLOW" | "MAGENTA" | "CYAN" | "WHITE";
  setLedColor: (
    value: "RED" | "GREEN" | "BLUE" | "YELLOW" | "MAGENTA" | "CYAN" | "WHITE",
  ) => void;
  vibrationIntensity: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
  setVibrationIntensity: (value: "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM") => void;
  snoozePeriod: string;
  setSnoozePeriod: (value: string) => void;
  snoozeTimeout: string;
  setSnoozeTimeout: (value: string) => void;
  retriggerDelay: string;
  setRetriggerDelay: (value: string) => void;
  retriggerTimeout: string;
  setRetriggerTimeout: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

const OptionButton = ({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}) => (
  <Pressable
    onPress={onPress}
    style={{
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      backgroundColor: selected ? colors.primary[500] : colors.gray[100],
      borderRadius: 6,
      marginRight: spacing[2],
      marginBottom: spacing[2],
      borderWidth: 1,
      borderColor: selected ? colors.primary[600] : colors.gray[200],
    }}
  >
    <Text
      style={[
        typography.caption,
        {
          color: selected ? "#FFFFFF" : colors.text.primary,
          fontWeight: selected ? "600" : "normal",
        },
      ]}
    >
      {color && (
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: color,
            marginRight: spacing[1],
          }}
        />
      )}
      {label}
    </Text>
  </Pressable>
);

export function AlarmPreferencesSection({
  severityLevel,
  setSeverityLevel,
  ledPattern,
  setLedPattern,
  ledColor,
  setLedColor,
  vibrationIntensity,
  setVibrationIntensity,
  snoozePeriod,
  setSnoozePeriod,
  snoozeTimeout,
  setSnoozeTimeout,
  retriggerDelay,
  setRetriggerDelay,
  retriggerTimeout,
  setRetriggerTimeout,
  onSave,
  isSaving,
}: AlarmPreferencesSectionProps) {
  const ledColorMap: Record<string, string> = {
    RED: "#FF0000",
    GREEN: "#00FF00",
    BLUE: "#0000FF",
    YELLOW: "#FFFF00",
    MAGENTA: "#FF00FF",
    CYAN: "#00FFFF",
    WHITE: "#FFFFFF",
  };

  return (
    <View
      style={{
        marginTop: spacing[10],
        paddingTop: spacing[6],
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
      }}
    >
      <Text style={[typography.h5, { marginBottom: spacing[4] }]}>
        Default Alarm Settings
      </Text>
      <Text
        style={[
          typography.caption,
          { color: colors.text.secondary, marginBottom: spacing[6] },
        ]}
      >
        These settings will be used as defaults when creating new alarms
      </Text>

      {/* Severity Level */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[inputs.label, { marginBottom: spacing[2] }]}>
          Severity Level
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <OptionButton
            label="Info"
            selected={severityLevel === "INFORMATIONAL"}
            onPress={() => setSeverityLevel("INFORMATIONAL")}
          />
          <OptionButton
            label="Warning"
            selected={severityLevel === "WARNING"}
            onPress={() => setSeverityLevel("WARNING")}
          />
          <OptionButton
            label="Critical"
            selected={severityLevel === "CRITICAL"}
            onPress={() => setSeverityLevel("CRITICAL")}
          />
        </View>
      </View>

      {/* LED Pattern */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[inputs.label, { marginBottom: spacing[2] }]}>
          LED Pattern
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <OptionButton
            label="Solid"
            selected={ledPattern === "SOLID"}
            onPress={() => setLedPattern("SOLID")}
          />
          <OptionButton
            label="Blink Slow"
            selected={ledPattern === "BLINK_SLOW"}
            onPress={() => setLedPattern("BLINK_SLOW")}
          />
          <OptionButton
            label="Blink Fast"
            selected={ledPattern === "BLINK_FAST"}
            onPress={() => setLedPattern("BLINK_FAST")}
          />
          <OptionButton
            label="Pulse"
            selected={ledPattern === "PULSE"}
            onPress={() => setLedPattern("PULSE")}
          />
          <OptionButton
            label="Strobe"
            selected={ledPattern === "STROBE"}
            onPress={() => setLedPattern("STROBE")}
          />
        </View>
      </View>

      {/* LED Color */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[inputs.label, { marginBottom: spacing[2] }]}>
          LED Color
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {(
            ["RED", "GREEN", "BLUE", "YELLOW", "MAGENTA", "CYAN", "WHITE"] as const
          ).map((color) => (
            <OptionButton
              key={color}
              label={color}
              selected={ledColor === color}
              onPress={() => setLedColor(color)}
              color={ledColorMap[color]}
            />
          ))}
        </View>
      </View>

      {/* Vibration Intensity */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[inputs.label, { marginBottom: spacing[2] }]}>
          Vibration Intensity
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <OptionButton
            label="Low"
            selected={vibrationIntensity === "LOW"}
            onPress={() => setVibrationIntensity("LOW")}
          />
          <OptionButton
            label="Medium"
            selected={vibrationIntensity === "MEDIUM"}
            onPress={() => setVibrationIntensity("MEDIUM")}
          />
          <OptionButton
            label="High"
            selected={vibrationIntensity === "HIGH"}
            onPress={() => setVibrationIntensity("HIGH")}
          />
          <OptionButton
            label="Maximum"
            selected={vibrationIntensity === "MAXIMUM"}
            onPress={() => setVibrationIntensity("MAXIMUM")}
          />
        </View>
      </View>

      {/* Time Settings */}
      <View style={{ marginBottom: spacing[6] }}>
        <Text style={[typography.body, { marginBottom: spacing[4], fontWeight: "600" }]}>
          Time Settings (minutes)
        </Text>

        <View style={inputs.container}>
          <Text style={inputs.label}>Snooze Period</Text>
          <TextInput
            style={inputs.base}
            value={snoozePeriod}
            onChangeText={setSnoozePeriod}
            placeholder="5"
            keyboardType="numeric"
            placeholderTextColor={colors.text.tertiary}
          />
        </View>

        <View style={inputs.container}>
          <Text style={inputs.label}>Snooze Timeout</Text>
          <TextInput
            style={inputs.base}
            value={snoozeTimeout}
            onChangeText={setSnoozeTimeout}
            placeholder="15"
            keyboardType="numeric"
            placeholderTextColor={colors.text.tertiary}
          />
        </View>

        <View style={inputs.container}>
          <Text style={inputs.label}>Retrigger Delay</Text>
          <TextInput
            style={inputs.base}
            value={retriggerDelay}
            onChangeText={setRetriggerDelay}
            placeholder="1"
            keyboardType="numeric"
            placeholderTextColor={colors.text.tertiary}
          />
        </View>

        <View style={inputs.container}>
          <Text style={inputs.label}>Retrigger Timeout</Text>
          <TextInput
            style={inputs.base}
            value={retriggerTimeout}
            onChangeText={setRetriggerTimeout}
            placeholder="5"
            keyboardType="numeric"
            placeholderTextColor={colors.text.tertiary}
          />
        </View>
      </View>

      {/* Save Button */}
      <Pressable
        style={[
          buttons.base,
          buttons.large,
          buttons.primary,
          isSaving && buttons.disabled,
        ]}
        onPress={onSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color={colors.text.inverse} />
        ) : (
          <Text style={buttonText.primary}>Save Alarm Preferences</Text>
        )}
      </Pressable>
    </View>
  );
}
