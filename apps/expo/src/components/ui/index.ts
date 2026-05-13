/**
 * UI Components
 *
 * Centralized export of all reusable UI components.
 * These components provide consistent styling, accessibility, and behavior.
 */

// Layout & Navigation
export { Header } from "./Header";
export { HamburgerMenu } from "./HamburgerMenu";

// Core Components
export { Button } from "./Button";
export type { ButtonVariant, ButtonSize } from "./Button";

export { Card } from "./Card";
export type { CardVariant, CardProps } from "./Card";

export { FormField } from "./FormField";
export { Toggle } from "./Toggle";
export { SectionHeader } from "./SectionHeader";

// Accessible Text Components
export {
  AccessibleText,
  Heading,
  BodyText,
  Caption,
  Label,
} from "./AccessibleText";
export type { TextVariant } from "./AccessibleText";

// Form Components
export { DateTimePickerModal, DateTimeField } from "./DateTimePickerModal";
export type { PickerMode } from "./DateTimePickerModal";

export { SelectionGroup, DaySelector } from "./SelectionGroup";
export type { SelectionOption } from "./SelectionGroup";

// State Components
export { LoadingState } from "./LoadingState";
export { EmptyState } from "./EmptyState";

// Modals
export { HelpModal } from "./HelpModal";
export { YearOfBirthModal } from "./YearOfBirthModal";

// Shared UI primitives (onboarding + dashboard + alarm-detail)
export { StepIndicator } from "./StepIndicator";
export { StatusPill } from "./StatusPill";
export { Segmented } from "./Segmented";
export { Stepper } from "./Stepper";
