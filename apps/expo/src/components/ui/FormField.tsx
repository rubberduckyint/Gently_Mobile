/**
 * FormField Component
 *
 * A consistent wrapper for form inputs with label, error handling, and accessibility.
 * Designed to handle large font settings gracefully.
 */

import type { StyleProp, ViewStyle } from "react-native";
import { Text, TextInput, useWindowDimensions, View } from "react-native";

import { colors, inputs, spacing, typography } from "~/styles";
import { textInputA11y } from "~/utils/accessibility";

interface FormFieldProps {
  /** Field label */
  label: string;
  /** Current value */
  value: string;
  /** Called when value changes */
  onChangeText: (text: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Error message to display */
  error?: string;
  /** Whether field is required */
  required?: boolean;
  /** Additional helper text */
  helperText?: string;
  /** Accessibility hint */
  accessibilityHint?: string;
  /** Enable multiline input */
  multiline?: boolean;
  /** Number of lines for multiline */
  numberOfLines?: number;
  /** Maximum character length */
  maxLength?: number;
  /** Keyboard type */
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  /** Auto-capitalize behavior */
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  /** Render input as a secure text field (passwords). */
  secureTextEntry?: boolean;
  /** Disable autocorrect (useful for usernames/passwords) */
  autoCorrect?: boolean;
  /** Disable the input */
  disabled?: boolean;
  /** Additional styles for the container */
  style?: StyleProp<ViewStyle>;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  required = false,
  helperText,
  accessibilityHint,
  multiline = false,
  numberOfLines = 1,
  maxLength,
  keyboardType = "default",
  autoCapitalize = "sentences",
  secureTextEntry = false,
  autoCorrect,
  disabled = false,
  style,
  autoFocus = false,
}: FormFieldProps) {
  const { fontScale } = useWindowDimensions();
  const isLargeText = fontScale > 1.3;
  const isVeryLargeText = fontScale > 1.8;

  const hasError = !!error;
  const a11yProps = textInputA11y(`${label}${required ? ", required" : ""}`, {
    hint: accessibilityHint,
    value,
    placeholder,
  });

  // Scale input height with font size
  const baseLineHeight = 24;
  const scaledLineHeight = baseLineHeight * Math.min(fontScale, 1.5);
  const minInputHeight = Math.max(44, scaledLineHeight + spacing[4]); // 44pt minimum for accessibility

  // Increase vertical spacing for large text
  const fieldSpacing = isVeryLargeText
    ? spacing[6]
    : isLargeText
      ? spacing[5]
      : spacing[4];
  const labelSpacing = isLargeText ? spacing[3] : spacing[2];

  return (
    <View style={[{ marginBottom: fieldSpacing }, style]}>
      {/* Label */}
      <Text
        style={[
          typography.label,
          {
            marginBottom: labelSpacing,
            flexWrap: "wrap",
          },
          hasError && { color: colors.error[500] },
        ]}
      >
        {label}
        {required && <Text style={{ color: colors.error[500] }}> *</Text>}
      </Text>

      {/* Input */}
      <TextInput
        style={[
          inputs.base,
          {
            minHeight: multiline
              ? numberOfLines * scaledLineHeight
              : minInputHeight,
            paddingVertical: isLargeText ? spacing[4] : spacing[3],
          },
          multiline && {
            textAlignVertical: "top",
            paddingTop: spacing[3],
          },
          hasError && {
            borderColor: colors.error[500],
            borderWidth: 2,
          },
          disabled && { opacity: 0.6, backgroundColor: colors.gray[100] },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.secondary}
        multiline={multiline}
        numberOfLines={numberOfLines}
        maxLength={maxLength}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        autoCorrect={autoCorrect}
        editable={!disabled}
        autoFocus={autoFocus}
        // Allow font scaling up to a reasonable limit
        maxFontSizeMultiplier={1.5}
        {...a11yProps}
      />

      {/* Error or helper text */}
      {(hasError || helperText) && (
        <Text
          style={[
            typography.caption,
            {
              marginTop: spacing[1],
              color: hasError ? colors.error[500] : colors.text.secondary,
              flexWrap: "wrap",
            },
          ]}
        >
          {hasError ? error : helperText}
        </Text>
      )}
    </View>
  );
}
