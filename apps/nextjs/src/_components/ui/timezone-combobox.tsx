"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "~/_components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/_components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/_components/ui/popover";
import { cn } from "~/lib/utils";
import { getGroupedTimezones } from "~/utils/timezone";

interface TimezoneComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TimezoneCombobox({
  value,
  onValueChange,
  placeholder = "Select timezone...",
  className,
}: TimezoneComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const groupedTimezones = getGroupedTimezones();

  // Flatten all timezones for searching
  const allTimezones = React.useMemo(() => {
    return Object.entries(groupedTimezones).flatMap(([region, timezones]) =>
      timezones.map((tz) => ({
        ...tz,
        region,
        searchText: `${tz.label} ${region}`.toLowerCase(),
      })),
    );
  }, [groupedTimezones]);

  const selectedTimezone = allTimezones.find((tz) => tz.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {selectedTimezone ? selectedTimezone.label : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezones..." />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            {Object.entries(groupedTimezones).map(([region, timezones]) => (
              <CommandGroup key={region} heading={region}>
                {timezones.map((timezone) => (
                  <CommandItem
                    key={timezone.value}
                    value={timezone.value}
                    onSelect={(currentValue) => {
                      onValueChange?.(
                        currentValue === value ? "" : currentValue,
                      );
                      setOpen(false);
                    }}
                    keywords={[timezone.label, region]}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === timezone.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {timezone.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
