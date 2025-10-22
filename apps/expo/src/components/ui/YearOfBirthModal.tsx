/**
 * YearOfBirthModal Component
 *
 * Collects user's year of birth on first signup to personalize their experience.
 * Shows before the help/onboarding modal.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { buttons, cards, colors, inputs, spacing, typography } from "~/styles";

interface YearOfBirthModalProps {
  visible: boolean;
  onComplete: (yearOfBirth: number) => void;
  onSkip: () => void;
  isLoading?: boolean;
}

export function YearOfBirthModal({
  visible,
  onComplete,
  onSkip,
  isLoading = false,
}: YearOfBirthModalProps) {
  // Default to 18 years ago
  const currentYear = new Date().getFullYear();
  const defaultYear = currentYear - 18;

  const [yearOfBirth, setYearOfBirth] = useState(defaultYear.toString());

  const handleSubmit = () => {
    const year = parseInt(yearOfBirth);

    // Validation
    if (isNaN(year)) {
      Alert.alert("Invalid Year", "Please enter a valid year");
      return;
    }

    const minYear = 1900;
    const maxYear = currentYear;

    if (year < minYear || year > maxYear) {
      Alert.alert(
        "Invalid Year",
        `Please enter a year between ${minYear} and ${maxYear}`,
      );
      return;
    }

    onComplete(year);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onSkip}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: spacing[4],
        }}
      >
        <View
          style={[
            cards.base,
            {
              width: "100%",
              maxWidth: 400,
            },
          ]}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: spacing[6],
              paddingTop: spacing[6],
              paddingBottom: spacing[4],
            }}
          >
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onSkip}
              disabled={isLoading}
              style={{
                padding: spacing[1],
              }}
            >
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </Pressable>
          </View>

          {/* Content */}
          <View
            style={{
              paddingHorizontal: spacing[6],
              paddingBottom: spacing[6],
            }}
          >
            {/* Icon */}
            <View
              style={{
                alignItems: "center",
                marginBottom: spacing[4],
              }}
            >
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: `${colors.primary[500]}20`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={40}
                  color={colors.primary[500]}
                />
              </View>
            </View>

            {/* Title */}
            <Text
              style={[
                typography.h4,
                {
                  color: colors.text.primary,
                  marginBottom: spacing[3],
                  textAlign: "center",
                },
              ]}
            >
              Help Us Personalize Your Experience
            </Text>

            {/* Description */}
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  marginBottom: spacing[5],
                  textAlign: "center",
                  lineHeight: 24,
                },
              ]}
            >
              We use your year of birth to tailor the app to your needs and
              provide age-appropriate features and recommendations.
            </Text>

            {/* Input */}
            <View style={inputs.container}>
              <Text style={inputs.label}>Year of Birth</Text>
              <TextInput
                style={inputs.base}
                value={yearOfBirth}
                onChangeText={setYearOfBirth}
                placeholder="YYYY"
                keyboardType="numeric"
                maxLength={4}
                placeholderTextColor={colors.text.tertiary}
                editable={!isLoading}
              />
              <Text
                style={[
                  typography.caption,
                  { color: colors.text.tertiary, marginTop: spacing[1] },
                ]}
              >
                This information is private and helps us serve you better
              </Text>
            </View>

            {/* Action Buttons */}
            <View
              style={{
                gap: spacing[3],
                marginTop: spacing[5],
              }}
            >
              <Pressable
                style={[buttons.base, buttons.large, buttons.primary]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.text.inverse} />
                ) : (
                  <Text
                    style={[typography.label, { color: colors.text.inverse }]}
                  >
                    Continue
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={onSkip}
                disabled={isLoading}
                style={{
                  paddingVertical: spacing[2],
                  alignItems: "center",
                }}
              >
                <Text
                  style={[typography.caption, { color: colors.text.tertiary }]}
                >
                  Skip for now
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
