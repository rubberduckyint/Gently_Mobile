"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { Alarm } from "@gently/db";

import { Button } from "~/_components/ui/button";
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
import { Textarea } from "~/_components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "~/_components/ui/toggle-group";
import { authClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

// Type aliases for cleaner code
type HapticChoice = Alarm["hapticChoice"];
type AlarmPriority = Alarm["priority"];

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

const getHapticOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "STANDARD" as HapticChoice, label: t("alarms.haptic.standard") },
  { value: "STRONG" as HapticChoice, label: t("alarms.haptic.strong") },
  { value: "SOFT" as HapticChoice, label: t("alarms.haptic.soft") },
  { value: "DOUBLE" as HapticChoice, label: t("alarms.haptic.double") },
  { value: "PULSE" as HapticChoice, label: t("alarms.haptic.pulse") },
  { value: "WAVE" as HapticChoice, label: t("alarms.haptic.wave") },
];

const getPriorityOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: "LOW" as AlarmPriority, label: t("alarms.priority.low") },
  { value: "MEDIUM" as AlarmPriority, label: t("alarms.priority.medium") },
  { value: "HIGH" as AlarmPriority, label: t("alarms.priority.high") },
];

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
    description: z.string().max(128, "Description too long").optional(),
    startDate: z.string().min(1, "Start date is required"),
    repeat: z.boolean(),
    repeatType: z.enum(["minutes", "hours", "days", "weeks"]),
    repeatEvery: z.number().min(1, "Must be at least 1"),
    daysOfWeek: z.array(z.string()),
    ends: z.enum(["never", "on", "after"]),
    endsOnDate: z.string().optional(),
    endsAfter: z.number().min(1, "Must be at least 1").optional(),
    color: z.string().min(4, "Invalid color").max(9, "Invalid color"),
    hapticChoice: z.enum([
      "STANDARD",
      "STRONG",
      "SOFT",
      "DOUBLE",
      "PULSE",
      "WAVE",
    ]),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
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
  const HAPTIC_OPTIONS = getHapticOptions(t);
  const PRIORITY_OPTIONS = getPriorityOptions(t);
  const REPEAT_TYPE_OPTIONS = getRepeatTypeOptions(t);

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
      // Note: "after X occurrences" would need additional data from the alarm system
      // For now, we'll default to "never" if endDate is not set

      return {
        title: alarm.title,
        description: alarm.description ?? undefined,
        startDate: formatDateTimeLocal(alarm.startDate),
        repeat: alarm.repeat,
        repeatType: "days",
        repeatEvery: 1,
        daysOfWeek: [],
        ends,
        endsOnDate,
        endsAfter,
        color: alarm.color,
        hapticChoice: alarm.hapticChoice,
        priority: alarm.priority,
      };
    }

    return {
      title: "",
      description: undefined,
      startDate: formatDateTimeLocal(defaultStart),
      repeat: false,
      repeatType: "days",
      repeatEvery: 1,
      daysOfWeek: [],
      ends: "never" as const,
      endsOnDate: undefined,
      endsAfter: undefined,
      color: "#3b82f6", // Default blue color
      hapticChoice: "STANDARD",
      priority: "MEDIUM",
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

      // Handle "after X occurrences" case
      if (values.repeat && values.ends === "after" && values.endsAfter) {
        // Note: This requires backend logic to track occurrences and automatically
        // deactivate the alarm after the specified number of executions
        console.log(`Alarm should end after ${values.endsAfter} occurrences`);
        // TODO: Implement occurrence tracking in the alarm system
      }

      if (mode === "edit" && alarmId) {
        updateMutation.mutate({
          id: alarmId,
          title: values.title,
          description: values.description,
          startDate: startDateString,
          endDate: endDateString,
          repeat: values.repeat,
          cronExpression,
          color: values.color,
          priority: values.priority,
          hapticChoice: values.hapticChoice,
        });
      } else if (mode === "create" && deviceId && userId) {
        createMutation.mutate({
          title: values.title,
          description: values.description,
          isActive: true,
          startDate: startDateString,
          endDate: endDateString,
          repeat: values.repeat,
          cronExpression,
          color: values.color,
          priority: values.priority,
          hapticChoice: values.hapticChoice,
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
        {/* Title */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("alarms.form.title")}</FormLabel>
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

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("alarms.form.description")}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t("alarms.form.descriptionPlaceholder")}
                  {...field}
                  value={field.value ?? ""}
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

        {/* Color */}
        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("alarms.form.color")}</FormLabel>
              <FormDescription>
                {t("alarms.form.chooseColorForAlarm")}
              </FormDescription>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-10 w-16 border-none bg-transparent p-1"
                    {...field}
                  />
                  <Input
                    type="text"
                    placeholder="#000000"
                    className="font-mono text-sm"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Haptic Choice */}
        <FormField
          control={form.control}
          name="hapticChoice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("alarms.form.vibrationPattern")}</FormLabel>
              <FormDescription>
                {t("alarms.form.selectVibrationPattern")}
              </FormDescription>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HAPTIC_OPTIONS.map((option) => (
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

        {/* Priority */}
        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("alarms.form.priority")}</FormLabel>
              <FormDescription>
                {t("alarms.form.setImportanceLevel")}
              </FormDescription>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
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

        {/* Repeat */}
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
            <h3 className="text-sm font-medium">
              {t("alarms.form.repeatOptions")}
            </h3>

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
