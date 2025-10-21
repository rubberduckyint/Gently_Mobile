/**
 * TemplatesSection Component
 *
 * Quick templates for common alarm patterns to help users get started quickly.
 */

import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { AlarmFormData } from "./BasicInfoSection";
import { buttons, cards, colors, spacing, typography } from "~/styles";

interface Template {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  data: Partial<AlarmFormData>;
}

const TEMPLATES: Template[] = [
  {
    id: "weekday-morning",
    icon: "sunny",
    title: "Weekday Wake Up",
    description: "6:00 AM Mon-Fri",
    data: {
      title: "Wake Up",
      description: "",
      repeat: true,
      repeatType: "weeks",
      repeatEvery: 1,
      daysOfWeek: ["1", "2", "3", "4", "5"], // Mon-Fri
      ends: "never",
      severityLevel: "CRITICAL",
      ledPattern: "BLINK_FAST",
      ledColor: "YELLOW",
      vibrationPattern: "RAPID",
      vibrationIntensity: "HIGH",
      snoozePeriod: 5,
      snoozeTimeout: 15,
      retriggerDelay: 2,
      retriggerTimeout: 10,
      // startDate will be set dynamically when template is selected
    },
  },
  {
    id: "stretch-reminder",
    icon: "body",
    title: "Stretch Break",
    description: "Every 45 min, 9AM-5PM Mon-Fri",
    data: {
      title: "Stretch",
      description: "",
      repeat: true,
      repeatType: "minutes",
      repeatEvery: 45,
      daysOfWeek: [], // Not applicable for minute-based repeats
      ends: "never",
      severityLevel: "INFORMATIONAL",
      ledPattern: "PULSE",
      ledColor: "BLUE",
      vibrationPattern: "QUICK",
      vibrationIntensity: "LOW",
      snoozePeriod: 15,
      snoozeTimeout: 30,
      retriggerDelay: 0, // Disabled - simple reminder
      retriggerTimeout: 0, // Disabled - simple reminder
    },
  },
  {
    id: "medication",
    icon: "medical",
    title: "Medication",
    description: "Daily at 8:00 AM & 8:00 PM",
    data: {
      title: "Meds",
      description: "",
      repeat: true,
      repeatType: "hours",
      repeatEvery: 12,
      daysOfWeek: [],
      ends: "never",
      severityLevel: "WARNING",
      ledPattern: "SOLID",
      ledColor: "RED",
      vibrationPattern: "HEARTBEAT",
      vibrationIntensity: "MEDIUM",
      snoozePeriod: 10,
      snoozeTimeout: 30,
      retriggerDelay: 5,
      retriggerTimeout: 60,
    },
  },
  {
    id: "hourly",
    icon: "time",
    title: "Hourly Reminder",
    description: "Every hour",
    data: {
      title: "Hourly",
      description: "",
      repeat: true,
      repeatType: "hours",
      repeatEvery: 1,
      daysOfWeek: [],
      ends: "never",
      severityLevel: "INFORMATIONAL",
      ledPattern: "BLINK_SLOW",
      ledColor: "GREEN",
      vibrationPattern: "QUICK",
      vibrationIntensity: "LOW",
      snoozePeriod: 5,
      snoozeTimeout: 10,
      retriggerDelay: 0, // Disabled - simple reminder
      retriggerTimeout: 0, // Disabled - simple reminder
    },
  },
  {
    id: "once-45min",
    icon: "timer",
    title: "One-Time (45 min)",
    description: "Single reminder in 45 minutes",
    data: {
      title: "Reminder",
      description: "",
      repeat: false,
      repeatType: "days",
      repeatEvery: 1,
      daysOfWeek: [],
      ends: "never",
      severityLevel: "INFORMATIONAL",
      ledPattern: "BLINK_SLOW",
      ledColor: "BLUE",
      vibrationPattern: "QUICK",
      vibrationIntensity: "MEDIUM",
      snoozePeriod: 5,
      snoozeTimeout: 15,
      retriggerDelay: 0, // Disabled - simple one-time reminder
      retriggerTimeout: 0, // Disabled - simple one-time reminder
      // startDate will be set dynamically when template is selected
    },
  },
];

interface TemplatesSectionProps {
  onSelectTemplate: (template: Partial<AlarmFormData>) => void;
}

export function TemplatesSection({ onSelectTemplate }: TemplatesSectionProps) {
  return (
    <View style={[cards.base, { marginBottom: spacing[4] }]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: spacing[2],
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing[2],
          }}
        >
          <Ionicons name="sparkles" size={20} color={colors.primary[500]} />
          <Text style={[typography.h4]}>Quick Start Templates</Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing[1],
          }}
        >
          <Ionicons
            name="chevron-back"
            size={16}
            color={colors.text.tertiary}
          />
          <Text
            style={[
              typography.caption,
              { color: colors.text.tertiary, fontStyle: "italic" },
            ]}
          >
            Swipe
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.text.tertiary}
          />
        </View>
      </View>
      <Text
        style={[
          typography.caption,
          {
            color: colors.text.secondary,
            marginBottom: spacing[4],
            lineHeight: 18,
          },
        ]}
      >
        Choose a template to quickly set up a common alarm type, or scroll down
        to create a custom alarm.
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing[3], paddingRight: spacing[4] }}
      >
        {TEMPLATES.map((template) => (
          <Pressable
            key={template.id}
            onPress={() => {
              // Generate fresh data for wake up template to get correct time
              if (template.id === "weekday-morning") {
                const now = new Date();
                const date = new Date();
                date.setHours(6, 0, 0, 0);

                // If 6am today has already passed, set it to 6am tomorrow
                if (date <= now) {
                  date.setDate(date.getDate() + 1);
                }

                onSelectTemplate({
                  ...template.data,
                  startDate: date,
                });
              } else if (template.id === "medication") {
                // Set start date to 8:00 AM today, or 8:00 PM today if it's past 8 AM
                const now = new Date();
                const date = new Date();
                date.setHours(8, 0, 0, 0);

                // If 8am today has already passed, set it to 8pm today
                if (date <= now) {
                  date.setHours(20, 0, 0, 0);

                  // If 8pm has also passed, set to 8am tomorrow
                  if (date <= now) {
                    date.setDate(date.getDate() + 1);
                    date.setHours(8, 0, 0, 0);
                  }
                }

                onSelectTemplate({
                  ...template.data,
                  startDate: date,
                });
              } else if (template.id === "once-45min") {
                // Set start date to 45 minutes from now
                const now = new Date();
                const date = new Date(now.getTime() + 45 * 60 * 1000); // Add 45 minutes

                onSelectTemplate({
                  ...template.data,
                  startDate: date,
                });
              } else {
                onSelectTemplate(template.data);
              }
            }}
            style={[
              buttons.secondary,
              {
                minWidth: 140,
                maxWidth: 160,
                paddingVertical: spacing[4],
                paddingHorizontal: spacing[3],
                alignItems: "flex-start",
              },
            ]}
          >
            <Ionicons
              name={template.icon}
              size={28}
              color={colors.primary[500]}
              style={{ marginBottom: spacing[2] }}
            />
            <Text
              style={[
                typography.bodySmall,
                {
                  color: colors.text.primary,
                  fontWeight: "600",
                  marginBottom: spacing[1],
                },
              ]}
            >
              {template.title}
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, lineHeight: 16 },
              ]}
            >
              {template.description}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
