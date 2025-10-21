/**
 * HelpModal Component
 *
 * Friendly help/onboarding modal that explains how Gently works.
 * Shows on first login and accessible from hamburger menus.
 */

import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { buttons, cards, colors, spacing, typography } from "~/styles";

interface HelpModalProps {
  visible: boolean;
  onClose: () => void;
}

export function HelpModal({ visible, onClose }: HelpModalProps) {
  const [currentStep, setCurrentStep] = React.useState(0);

  const steps = [
    {
      icon: "hand-left" as const,
      title: "Welcome to Gently! 👋",
      description:
        "We're here to help you never miss important reminders. Let's take a quick tour to get you started!",
      color: colors.primary[500],
    },
    {
      icon: "notifications" as const,
      title: "Creating Alarms",
      description:
        "Alarms are gentle reminders sent to your Gently bracelet. You can create alarms for medications, appointments, or anything you need to remember!",
      tips: [
        "Tap '+ Alarm' to create a detailed alarm with custom schedules",
        "Use 'Remind' for quick one-time reminders (15, 30, 45 mins, or 1 hour)",
        "Customize LED colors, vibration patterns, and snooze settings",
      ],
      color: colors.success[500],
    },
    {
      icon: "watch" as const,
      title: "Your Bracelet Alerts You",
      description:
        "When an alarm goes off, your bracelet will light up and vibrate to gently get your attention.",
      tips: [
        "LED lights up in the color you chose",
        "Vibration pattern alerts you without being disruptive",
        "Works even when your phone is away or silenced",
      ],
      color: colors.warning[500],
    },
    {
      icon: "time" as const,
      title: "Snoozing an Alarm",
      description:
        "Need a few more minutes? Just press the button on your bracelet once to snooze.",
      tips: [
        "Press the bracelet button 1 time to snooze",
        "The alarm will remind you again after your snooze period",
        "Default snooze is 5 minutes (you can customize this!)",
      ],
      color: colors.primary[600],
    },
    {
      icon: "checkmark-circle" as const,
      title: "Dismissing an Alarm",
      description:
        "All done? Press the button twice quickly to dismiss the alarm completely.",
      tips: [
        "Press the bracelet button 2 times quickly to dismiss",
        "The alarm turns off and won't bother you again",
        "You can always check your alarm history in the app",
      ],
      color: colors.success[600],
    },
    {
      icon: "heart" as const,
      title: "You're All Set! 💙",
      description:
        "That's everything you need to know! Remember, we're here to help you stay on track in the gentlest way possible.",
      tips: [
        "Find this help anytime in the menu (☰)",
        "Make sure your bracelet is charged and connected",
        "Start with a simple test alarm to get comfortable",
      ],
      color: colors.primary[500],
    },
  ];

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  if (!currentStepData) {
    return null;
  }

  const handleNext = () => {
    if (isLastStep) {
      onClose();
      setCurrentStep(0); // Reset for next time
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
    setCurrentStep(0); // Reset for next time
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
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
              maxWidth: 500,
              maxHeight: "80%",
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
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing[2],
              }}
            >
              <Text
                style={[typography.caption, { color: colors.text.tertiary }]}
              >
                Step {currentStep + 1} of {steps.length}
              </Text>
            </View>
            <Pressable
              onPress={handleSkip}
              style={{
                padding: spacing[1],
              }}
            >
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </Pressable>
          </View>

          {/* Progress Indicator */}
          <View
            style={{
              flexDirection: "row",
              gap: spacing[1],
              paddingHorizontal: spacing[6],
              marginBottom: spacing[4],
            }}
          >
            {steps.map((_, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor:
                    index <= currentStep
                      ? currentStepData.color
                      : colors.border.light,
                }}
              />
            ))}
          </View>

          {/* Content */}
          <ScrollView
            style={{
              paddingHorizontal: spacing[6],
            }}
            showsVerticalScrollIndicator={false}
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
                  backgroundColor: `${currentStepData.color}20`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name={currentStepData.icon}
                  size={40}
                  color={currentStepData.color}
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
              {currentStepData.title}
            </Text>

            {/* Description */}
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  marginBottom: spacing[4],
                  textAlign: "center",
                  lineHeight: 24,
                },
              ]}
            >
              {currentStepData.description}
            </Text>

            {/* Tips */}
            {currentStepData.tips && (
              <View
                style={{
                  backgroundColor: colors.background.tertiary,
                  borderRadius: 12,
                  padding: spacing[4],
                  marginBottom: spacing[4],
                }}
              >
                {currentStepData.tips.map((tip, index) => (
                  <View
                    key={index}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      marginBottom:
                        index < currentStepData.tips.length - 1
                          ? spacing[3]
                          : 0,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={currentStepData.color}
                      style={{ marginRight: spacing[2], marginTop: 2 }}
                    />
                    <Text
                      style={[
                        typography.body,
                        {
                          color: colors.text.primary,
                          flex: 1,
                          lineHeight: 22,
                        },
                      ]}
                    >
                      {tip}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View
            style={{
              paddingHorizontal: spacing[6],
              paddingTop: spacing[4],
              paddingBottom: spacing[6],
              borderTopWidth: 1,
              borderTopColor: colors.border.light,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                gap: spacing[3],
              }}
            >
              {!isFirstStep && (
                <Pressable
                  style={[buttons.base, buttons.secondary, { flex: 1 }]}
                  onPress={handlePrevious}
                >
                  <Ionicons
                    name="arrow-back"
                    size={18}
                    color={colors.primary[600]}
                    style={{ marginRight: spacing[1] }}
                  />
                  <Text
                    style={[typography.label, { color: colors.primary[600] }]}
                  >
                    Back
                  </Text>
                </Pressable>
              )}
              <Pressable
                style={[
                  buttons.base,
                  buttons.primary,
                  { flex: isFirstStep ? 1 : 2 },
                ]}
                onPress={handleNext}
              >
                <Text
                  style={[typography.label, { color: colors.text.inverse }]}
                >
                  {isLastStep ? "Get Started!" : "Next"}
                </Text>
                {!isLastStep && (
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={colors.text.inverse}
                    style={{ marginLeft: spacing[1] }}
                  />
                )}
              </Pressable>
            </View>
            {!isLastStep && (
              <Pressable
                onPress={handleSkip}
                style={{
                  paddingVertical: spacing[3],
                  alignItems: "center",
                }}
              >
                <Text
                  style={[typography.caption, { color: colors.text.tertiary }]}
                >
                  Skip for now
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
