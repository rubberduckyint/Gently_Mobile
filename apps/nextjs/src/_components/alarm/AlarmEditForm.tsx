"use client";

import {
  Activity,
  Bell,
  Circle,
  CircleOff,
  Heart,
  Music,
  Watch,
  Zap,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { Alarm } from "@gently/db";

import { cn } from "~/lib/utils";
import { Button } from "~/_components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/_components/ui/card";
import { DialogClose, DialogFooter } from "~/_components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/_components/ui/form";
import { Input } from "~/_components/ui/input";
import { RadioGroup, RadioGroupItem } from "~/_components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/_components/ui/select";
import { Switch } from "~/_components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "~/_components/ui/toggle-group";
import { authClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

// LED Pattern options with icons (matching mobile app)
const LED_PATTERNS = [
  { key: "OFF", label: "Off", description: "LED disabled", icon: CircleOff },
  { key: "SOLID", label: "Solid", description: "Continuous steady light", icon: Circle },
  { key: "BLINK_SLOW", label: "Slow", description: "Gentle pulsing light", icon: Circle },
  { key: "BLINK_FAST", label: "Fast", description: "Rapid attention-getting flashes", icon: Zap },
  { key: "PULSE", label: "Pulse", description: "Smooth breathing effect", icon: Heart },
  { key: "STROBE", label: "Strobe", description: "Intense flashing pattern", icon: Zap },
] as const;

// LED Color options (matching mobile app)
const LED_COLORS = [
  { key: "RED", label: "Red", color: "#ef4444" },
  { key: "GREEN", label: "Green", color: "#22c55e" },
  { key: "BLUE", label: "Blue", color: "#3b82f6" },
  { key: "YELLOW", label: "Yellow", color: "#eab308" },
  { key: "MAGENTA", label: "Magenta", color: "#FF1493" },
  { key: "CYAN", label: "Cyan", color: "#00BFFF" },
  { key: "WHITE", label: "White", color: "#f3f4f6" },
] as const;

// Vibration intensity options (matching mobile app)
const VIBRATION_INTENSITIES = [
  { key: "LOW", label: "Low", description: "Gentle vibration" },
  { key: "MEDIUM", label: "Med", description: "Moderate vibration" },
  { key: "HIGH", label: "High", description: "Strong vibration" },
  { key: "MAXIMUM", label: "Max", description: "Maximum vibration" },
] as const;

// Vibration pattern options (matching mobile app)
const VIBRATION_PATTERNS = [
  { key: "QUICK", label: "Quick", description: "Short, sharp vibrations", icon: Zap, value: 1 },
  { key: "HEARTBEAT", label: "Heart", description: "Rhythmic double pulses", icon: Heart, value: 2 },
  { key: "RAPID", label: "Rapid", description: "Fast continuous pulses", icon: Activity, value: 3 },
  { key: "SYMPHONY", label: "Symphony", description: "Complex musical pattern", icon: Music, value: 4 },
] as const;

// Snooze period options (matching mobile app)
const SNOOZE_OPTIONS = [1, 3, 5, 10, 15] as const;

// Constants that will be translated
const getDaysOfWeek = (t: ReturnType<typeof useTranslations>) =>
  [
    {
      value: "0",
      label: t("common.sunday") || "Sunday",
      short: t("common.sun") || "Sun",
    },
    {
      value: "1",
      label: t("common.monday") || "Monday",
      short: t("common.mon") || "Mon",
    },
    {
      value: "2",
      label: t("common.tuesday") || "Tuesday",
      short: t("common.tue") || "Tue",
    },
    {
      value: "3",
      label: t("common.wednesday") || "Wednesday",
      short: t("common.wed") || "Wed",
    },
    {
      value: "4",
      label: t("common.thursday") || "Thursday",
      short: t("common.thu") || "Thu",
    },
    {
      value: "5",
      label: t("common.friday") || "Friday",
      short: t("common.fri") || "Fri",
    },
    {
      value: "6",
      label: t("common.saturday") || "Saturday",
      short: t("common.sat") || "Sat",
    },
  ] as const;

const getRepeatTypeOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "minutes" as const, label: t("common.minutes") || "Minutes" },
  { value: "hours" as const, label: t("common.hours") || "Hours" },
  { value: "days" as const, label: t("common.days") || "Days" },
  { value: "weeks" as const, label: t("common.weeks") || "Weeks" },
];

// Form schema
const alarmFormSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(50, "Title too long"),
    startDate: z.string().min(1, "Start date is required"),
    repeat: z.boolean(),
    repeatType: z.enum(["minutes", "hours", "days", "weeks"]),
    repeatEvery: z.number().min(1, "Must be at least 1"),
    daysOfWeek: z.array(z.string()),
    ends: z.enum(["never", "on", "after"]),
    endsOnDate: z.string().optional(),
    endsAfter: z.number().min(1, "Must be at least 1").optional(),
    // Bracelet settings
    ledPattern: z.enum([
      "OFF",
      "SOLID",
      "BLINK_SLOW",
      "BLINK_FAST",
      "PULSE",
      "STROBE",
    ]),
    ledColor: z.enum([
      "RED",
      "GREEN",
      "BLUE",
      "YELLOW",
      "MAGENTA",
      "CYAN",
      "WHITE",
    ]),
    vibrationPattern: z.number().min(1).max(10),
    vibrationIntensity: z.enum(["LOW", "MEDIUM", "HIGH", "MAXIMUM"]),
    snoozePeriod: z.number().min(1).max(60),
  })
  .superRefine((data, ctx) => {
    // Only validate ends fields if repeat is true
    if (data.repeat) {
      if (data.ends === "on" && !data.endsOnDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endsOnDate"],
          message: "End date is required",
        });
      }
      if (data.ends === "after" && (!data.endsAfter || data.endsAfter < 1)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endsAfter"],
          message: "Number of occurrences must be at least 1",
        });
      }
    }
  });

type AlarmFormValues = z.infer<typeof alarmFormSchema>;

// Utility functions
function generateCronExpression(values: AlarmFormValues): string {
  const date = new Date(values.startDate);
  const minute = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth() + 1;

  if (!values.repeat) {
    // One-time alarm
    return `${minute} ${hour} ${day} ${month} *`;
  }

  switch (values.repeatType) {
    case "minutes":
      return `*/${values.repeatEvery} * * * *`;
    case "hours":
      return `${minute} */${values.repeatEvery} * * *`;
    case "days":
      return `${minute} ${hour} */${values.repeatEvery} * *`;
    case "weeks": {
      const days =
        values.daysOfWeek.length > 0 ? values.daysOfWeek.join(",") : "*";
      return `${minute} ${hour} * * ${days}`;
    }
    default:
      return `${minute} ${hour} ${day} ${month} *`;
  }
}

function formatDateTimeLocal(date: Date): string {
  // Format date as local datetime input value
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

interface AlarmEditFormProps {
  alarm?: Alarm;
  mode?: "create" | "edit";
  alarmId?: string;
  deviceId?: string;
  userId?: string;
  onClose?: () => void;
  onSuccess?: () => void;
}

export function AlarmEditForm({
  alarm,
  mode = "create",
  alarmId,
  deviceId,
  userId,
  onClose,
  onSuccess,
}: AlarmEditFormProps) {
  const { data: _session } = authClient.useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createMutation = useMutation(
    trpc.alarm.create.mutationOptions({
      onSuccess: () => {
        toast.success("Alarm created successfully");
        // Invalidate device data to refetch alarms
        if (deviceId) {
          void queryClient.invalidateQueries({
            queryKey: trpc.device.getById.queryKey({ id: deviceId }),
          });
        }
        onSuccess?.();
        onClose?.();
      },
      onError: (error) => {
        console.error("Error creating alarm:", error);
        toast.error("Failed to create alarm");
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.alarm.update.mutationOptions({
      onSuccess: () => {
        toast.success("Alarm updated successfully");
        // Invalidate device data to refetch alarms
        if (deviceId) {
          void queryClient.invalidateQueries({
            queryKey: trpc.device.getById.queryKey({ id: deviceId }),
          });
        }
        onSuccess?.();
        onClose?.();
      },
      onError: (error) => {
        console.error("Error updating alarm:", error);
        toast.error("Failed to update alarm");
      },
    }),
  );

  const t = useTranslations();

  // Get translated constants
  const DAYS_OF_WEEK = getDaysOfWeek(t);
  const REPEAT_TYPE_OPTIONS = getRepeatTypeOptions(t);

  // Get current LED pattern for description display
  const watchedLedPattern = form.watch("ledPattern");
  const watchedVibrationIntensity = form.watch("vibrationIntensity");
  const watchedVibrationPattern = form.watch("vibrationPattern");

  const currentLedPattern = LED_PATTERNS.find((p) => p.key === watchedLedPattern);
  const currentVibrationIntensity = VIBRATION_INTENSITIES.find(
    (i) => i.key === watchedVibrationIntensity
  );
  const currentVibrationPatternObj = VIBRATION_PATTERNS.find(
    (p) => p.value === watchedVibrationPattern
  );

  // Generate default values
  const getDefaultValues = (): AlarmFormValues => {
    const now = new Date();
    const defaultStart = new Date(now.getTime() + 60000); // 1 minute from now

    if (alarm) {
      // Determine ends values based on alarm data
      let ends: "never" | "on" | "after" = "never";
      let endsOnDate: string | undefined = undefined;
      const endsAfter: number | undefined = undefined;

      if (alarm.repeat && alarm.endDate) {
        ends = "on";
        endsOnDate = formatDateTimeLocal(alarm.endDate);
      }

      return {
        title: alarm.title,
        startDate: formatDateTimeLocal(alarm.startDate),
        repeat: alarm.repeat,
        repeatType: "days",
        repeatEvery: 1,
        daysOfWeek: [],
        ends,
        endsOnDate,
        endsAfter,
        ledPattern: alarm.ledPattern,
        ledColor: alarm.ledColor,
        vibrationPattern: alarm.vibrationPattern,
        vibrationIntensity: alarm.vibrationIntensity,
        snoozePeriod: alarm.snoozePeriod,
      };
    }

    return {
      title: "",
      startDate: formatDateTimeLocal(defaultStart),
      repeat: false,
      repeatType: "days",
      repeatEvery: 1,
      daysOfWeek: [],
      ends: "never" as const,
      endsOnDate: undefined,
      endsAfter: undefined,
      ledPattern: "BLINK_SLOW" as const,
      ledColor: "BLUE" as const,
      vibrationPattern: 1,
      vibrationIntensity: "MEDIUM" as const,
      snoozePeriod: 5,
    };
  };

  const form = useForm<AlarmFormValues>({
    resolver: zodResolver(alarmFormSchema),
    defaultValues: getDefaultValues(),
  });

  const { watch } = form;
  const repeat = watch("repeat");
  const repeatType = watch("repeatType");
  const ends = watch("ends");

  const handleSubmit = (values: AlarmFormValues) => {
    try {
      const cronExpression = generateCronExpression(values);
      // Parse the datetime-local input value as local time
      const startDate = new Date(values.startDate);
      const startDateString = startDate.toISOString();

      // Calculate end date based on the ends option
      let endDateString: string | undefined = undefined;
      if (values.repeat && values.ends === "on" && values.endsOnDate) {
        const endDate = new Date(values.endsOnDate);
        endDateString = endDate.toISOString();
      }

      // Common values for create/update
      const alarmData = {
        title: values.title,
        startDate: startDateString,
        endDate: endDateString,
        repeat: values.repeat,
        cronExpression,
        ledPattern: values.ledPattern,
        ledColor: values.ledColor,
        vibrationPattern: values.vibrationPattern,
        vibrationIntensity: values.vibrationIntensity,
        snoozePeriod: values.snoozePeriod,
        // Use default values for removed fields
        severityLevel: "INFORMATIONAL" as const,
        snoozeTimeout: 15,
        retriggerDelay: values.snoozePeriod,
        retriggerTimeout: 5,
      };

      if (mode === "edit" && alarmId) {
        updateMutation.mutate({
          id: alarmId,
          ...alarmData,
        });
      } else if (mode === "create" && deviceId && userId) {
        createMutation.mutate({
          ...alarmData,
          isActive: true,
          deviceId: deviceId,
        });
      }
    } catch (error) {
      console.error("Error preparing alarm data:", error);
      toast.error("Failed to prepare alarm data");
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Basic Information Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Bell className="h-5 w-5 text-primary" />
              {t("alarms.form.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("alarms.form.title")} *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("alarms.form.titlePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Start Date */}
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("alarms.form.startDate")}</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Repeat Toggle */}
            <FormField
              control={form.control}
              name="repeat"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {t("alarms.form.repeat")}
                    </FormLabel>
                    <FormDescription>
                      {t("alarms.form.makeAlarmRepeat")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Repeat Options */}
            {repeat && (
              <div className="space-y-4 rounded-lg border p-4">
                <h4 className="text-sm font-medium">
                  {t("alarms.form.repeatOptions")}
                </h4>

                <div className="flex items-center gap-2">
                  <span className="text-sm">{t("alarms.form.every")}</span>
                  <FormField
                    control={form.control}
                    name="repeatEvery"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={999}
                            className="w-20"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="repeatType"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {REPEAT_TYPE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Days of Week Selection */}
                {repeatType === "weeks" && (
                  <FormField
                    control={form.control}
                    name="daysOfWeek"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("alarms.form.daysOfWeek")}</FormLabel>
                        <FormControl>
                          <ToggleGroup
                            type="multiple"
                            value={field.value}
                            onValueChange={field.onChange}
                            className="justify-start"
                          >
                            {DAYS_OF_WEEK.map((day) => (
                              <ToggleGroupItem
                                key={day.value}
                                value={day.value}
                                aria-label={day.label}
                                className="h-10 w-12"
                              >
                                {day.short}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </FormControl>
                        <FormDescription>
                          {t("alarms.form.selectDaysOfWeek")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Ends */}
                <FormField
                  control={form.control}
                  name="ends"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("alarms.form.ends")}</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="space-y-3"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="never" id="never" />
                            <label
                              htmlFor="never"
                              className="cursor-pointer text-sm font-normal"
                            >
                              {t("alarms.form.never")}
                            </label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="on" id="on" />
                            <label
                              htmlFor="on"
                              className="cursor-pointer text-sm font-normal"
                            >
                              {t("alarms.form.on")}
                            </label>
                            <FormField
                              control={form.control}
                              name="endsOnDate"
                              render={({ field: dateField }) => (
                                <FormItem className="ml-2">
                                  <FormControl>
                                    <Input
                                      type="datetime-local"
                                      disabled={ends !== "on"}
                                      className="w-48"
                                      {...dateField}
                                      value={dateField.value ?? ""}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="after" id="after" />
                            <label
                              htmlFor="after"
                              className="cursor-pointer text-sm font-normal"
                            >
                              {t("alarms.form.after")}
                            </label>
                            <FormField
                              control={form.control}
                              name="endsAfter"
                              render={({ field: countField }) => (
                                <FormItem className="ml-2">
                                  <FormControl>
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        min={1}
                                        max={9999}
                                        disabled={ends !== "after"}
                                        className="w-20"
                                        {...countField}
                                        value={countField.value ?? ""}
                                        onChange={(e) =>
                                          countField.onChange(
                                            Number(e.target.value) || undefined,
                                          )
                                        }
                                      />
                                      <span className="text-muted-foreground text-sm">
                                        {t("alarms.form.occurrences")}
                                      </span>
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormDescription>
                        {t("alarms.form.chooseWhenToStop")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bracelet Settings Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Watch className="h-5 w-5 text-primary" />
              {t("alarms.braceletSettings") || "Bracelet Settings"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Snooze Period - Button Options */}
            <FormField
              control={form.control}
              name="snoozePeriod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("alarms.form.snoozePeriod") || "Snooze Period"}</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      {SNOOZE_OPTIONS.map((minutes) => (
                        <Button
                          key={minutes}
                          type="button"
                          variant={field.value === minutes ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => field.onChange(minutes)}
                        >
                          {minutes}m
                        </Button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Light Pattern - Icon Buttons */}
            <FormField
              control={form.control}
              name="ledPattern"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("alarms.form.ledPattern") || "Light Pattern"}</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      {LED_PATTERNS.map((pattern) => {
                        const Icon = pattern.icon;
                        return (
                          <Button
                            key={pattern.key}
                            type="button"
                            variant={field.value === pattern.key ? "default" : "outline"}
                            className="flex-1 p-2"
                            onClick={() => field.onChange(pattern.key)}
                            title={pattern.label}
                          >
                            <Icon className="h-5 w-5" />
                          </Button>
                        );
                      })}
                    </div>
                  </FormControl>
                  {currentLedPattern && (
                    <FormDescription>
                      {currentLedPattern.description}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* LED Color - Color Circles (only if pattern is not OFF) */}
            {watchedLedPattern !== "OFF" && (
              <FormField
                control={form.control}
                name="ledColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("alarms.form.ledColor") || "Light Color"}</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        {LED_COLORS.map((colorOption) => (
                          <button
                            key={colorOption.key}
                            type="button"
                            className={cn(
                              "h-10 w-10 rounded-full border-2 transition-all",
                              field.value === colorOption.key
                                ? "border-primary ring-2 ring-primary ring-offset-2"
                                : "border-muted"
                            )}
                            style={{ backgroundColor: colorOption.color }}
                            onClick={() => field.onChange(colorOption.key)}
                            title={colorOption.label}
                          />
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Vibration Intensity - Button Options */}
            <FormField
              control={form.control}
              name="vibrationIntensity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("alarms.form.vibrationIntensity") || "Vibration Strength"}
                  </FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      {VIBRATION_INTENSITIES.map((intensity) => (
                        <Button
                          key={intensity.key}
                          type="button"
                          variant={field.value === intensity.key ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => field.onChange(intensity.key)}
                        >
                          {intensity.label}
                        </Button>
                      ))}
                    </div>
                  </FormControl>
                  {currentVibrationIntensity && (
                    <FormDescription>
                      {currentVibrationIntensity.description}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Vibration Pattern - Icon Buttons */}
            <FormField
              control={form.control}
              name="vibrationPattern"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("alarms.form.vibrationPattern") || "Vibration Pattern"}
                  </FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      {VIBRATION_PATTERNS.map((pattern) => {
                        const Icon = pattern.icon;
                        return (
                          <Button
                            key={pattern.key}
                            type="button"
                            variant={field.value === pattern.value ? "default" : "outline"}
                            className="flex-1 p-2"
                            onClick={() => field.onChange(pattern.value)}
                            title={pattern.label}
                          >
                            <Icon className="h-5 w-5" />
                          </Button>
                        );
                      })}
                    </div>
                  </FormControl>
                  {currentVibrationPatternObj && (
                    <FormDescription>
                      {currentVibrationPatternObj.description}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Form Actions */}
        <DialogFooter>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isLoading} className="min-w-20">
            {isLoading
              ? t("common.saving")
              : mode === "edit"
                ? t("common.update")
                : t("common.create")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}