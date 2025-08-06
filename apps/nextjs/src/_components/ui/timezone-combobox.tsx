"use client";

// Timezone functionality temporarily disabled
// TODO: Re-enable when timezone utils are implemented
import * as React from "react";

interface TimezoneComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TimezoneCombobox({
  value: _value,
  onValueChange: _onValueChange,
  placeholder: _placeholder = "Select timezone...",
  className,
}: TimezoneComboboxProps) {
  // Temporarily disabled - return a simple div
  return (
    <div className={className}>
      <p className="text-muted-foreground text-sm">
        Timezone selection temporarily disabled
      </p>
    </div>
  );
}
