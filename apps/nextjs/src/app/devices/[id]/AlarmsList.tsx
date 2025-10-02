"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as cronstrue from "cronstrue";
import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";
import {
  Calendar,
  Clock,
  Edit,
  Flag,
  Palette,
  Plus,
  Trash2,
  Vibrate,
} from "lucide-react";
import { toast } from "sonner";

import type { Alarm } from "@gently/db";

import { AlarmEditForm } from "~/_components/alarm/AlarmEditForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/_components/ui/alert-dialog";
import { Badge } from "~/_components/ui/badge";
import { Button } from "~/_components/ui/button";
import { Card } from "~/_components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/_components/ui/dialog";
import { Skeleton } from "~/_components/ui/skeleton";
import { useTRPC } from "~/trpc/react";

interface AlarmsListProps {
  deviceId: string;
}

// Helper function to safely parse cron expressions
function formatCronExpression(cronExpression: string): string {
  try {
    return cronstrue.toString(cronExpression, {
      use24HourTimeFormat: false,
      verbose: true,
    });
  } catch (error) {
    console.warn("Failed to parse cron expression:", cronExpression, error);
    return "Invalid cron expression";
  }
}

// Helper function to format cron expression with start and end date information
function formatCronExpressionWithStartEnd(alarm: {
  startDate: Date | null;
  endDate: Date | null;
  cronExpression: string;
}): {
  cronDescription: string;
  startInfo: string | null;
  endInfo: string | null;
  isExpired: boolean;
} {
  const cronDescription = formatCronExpression(alarm.cronExpression);
  const now = new Date();
  const startDate = alarm.startDate ? new Date(alarm.startDate) : new Date();

  let startInfo = null;
  let endInfo = null;
  let isExpired = false;

  // Helper function to format dates with relative context
  const formatDateWithContext = (date: Date, _isPast: boolean) => {
    if (isToday(date)) {
      return `today at ${format(date, "h:mm a")}`;
    } else if (isTomorrow(date)) {
      return `tomorrow at ${format(date, "h:mm a")}`;
    } else if (isYesterday(date)) {
      return `yesterday at ${format(date, "h:mm a")}`;
    } else {
      const distance = formatDistanceToNow(date, { addSuffix: true });
      const fullDate = format(date, "MMM d, yyyy 'at' h:mm a");
      return `${fullDate} (${distance})`;
    }
  };

  // Format start date information
  if (startDate > now) {
    startInfo = `Starts ${formatDateWithContext(startDate, false)}`;
  } else {
    startInfo = `Started ${formatDateWithContext(startDate, true)}`;
  }

  // Format end date information
  if (alarm.endDate) {
    const endDate = new Date(alarm.endDate);
    if (endDate < now) {
      endInfo = `Ended ${formatDateWithContext(endDate, true)}`;
      isExpired = true;
    } else {
      endInfo = `Ends ${formatDateWithContext(endDate, false)}`;
    }
  }

  return {
    cronDescription,
    startInfo,
    endInfo,
    isExpired,
  };
}

// Helper function to format severity level
function formatSeverityLevel(severity: string): string {
  switch (severity) {
    case "INFORMATIONAL":
      return "Informational";
    case "WARNING":
      return "Warning";
    case "CRITICAL":
      return "Critical";
    default:
      return severity;
  }
}

// Helper function to format LED pattern
function formatLedPattern(pattern: string): string {
  switch (pattern) {
    case "SOLID":
      return "Solid";
    case "BLINK_SLOW":
      return "Blink Slow";
    case "BLINK_FAST":
      return "Blink Fast";
    case "PULSE":
      return "Pulse";
    case "STROBE":
      return "Strobe";
    default:
      return pattern;
  }
}

// Helper function to format LED color
function formatLedColor(color: string): string {
  switch (color) {
    case "RED":
      return "Red";
    case "GREEN":
      return "Green";
    case "BLUE":
      return "Blue";
    case "YELLOW":
      return "Yellow";
    case "MAGENTA":
      return "Magenta";
    case "CYAN":
      return "Cyan";
    case "WHITE":
      return "White";
    default:
      return color;
  }
}

// Helper function to format vibration intensity
function formatVibrationIntensity(intensity: string): string {
  switch (intensity) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    default:
      return intensity;
  }
}

// Helper function to get LED color for display
function getLedColorValue(color: string): string {
  switch (color) {
    case "RED":
      return "#ef4444";
    case "GREEN":
      return "#22c55e";
    case "BLUE":
      return "#3b82f6";
    case "YELLOW":
      return "#eab308";
    case "MAGENTA":
      return "#d946ef";
    case "CYAN":
      return "#06b6d4";
    case "WHITE":
      return "#ffffff";
    default:
      return "#6b7280";
  }
}

export default function AlarmsList({ deviceId }: AlarmsListProps) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editAlarm, setEditAlarm] = useState<Alarm | null>(null);
  const [createAlarmOpen, setCreateAlarmOpen] = useState(false);

  // Fetch alarms for this device
  const {
    data: device,
    isLoading,
    isError,
  } = useQuery(trpc.device.getById.queryOptions({ id: deviceId }));
  const alarms = device?.alarms ?? [];

  const deleteMutation = useMutation(
    trpc.alarm.delete.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.device.getById.queryKey({ id: deviceId }),
        });
        toast.success("Alarm deleted");
      },
      onError: (error: unknown) => {
        const errorMessage = (error as { message?: string }).message ?? "";
        const errorCode = (error as { data?: { code?: string } }).data?.code;

        if (
          errorCode === "NOT_FOUND" ||
          errorMessage.includes("No record was found for a delete")
        ) {
          toast.error("Alarm not found or already deleted.");
          void queryClient.invalidateQueries({
            queryKey: trpc.device.getById.queryKey({ id: deviceId }),
          });
        } else {
          toast.error("Failed to delete alarm");
        }
      },
    }),
  );

  const handleEdit = (alarm: Alarm) => {
    setEditAlarm(alarm);
  };

  const handleDelete = (alarm: Alarm) => {
    setDeleteId(alarm.id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate({ id: deleteId });
      setDeleteId(null);
    }
  };

  const cancelDelete = () => setDeleteId(null);

  if (isLoading) {
    return (
      <>
        <div className="mt-4 flex items-center gap-2">
          <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Alarms
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="ml-2"
            onClick={() => {
              setCreateAlarmOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Create Alarm
          </Button>
        </div>
        <h3 className="text-muted-foreground -mt-2 text-sm">
          Manage your device&#39;s alarms below.
        </h3>
        <Card className="w-full p-4">
          <Skeleton className="mb-2 h-6 w-1/3" />
          <Skeleton className="mb-2 h-4 w-2/3" />
          <Skeleton className="mb-2 h-4 w-1/2" />
          <Skeleton className="mb-2 h-6 w-1/3" />
        </Card>
      </>
    );
  }
  if (isError) {
    return (
      <Card className="text-destructive w-full p-4">
        Failed to load alarms.
      </Card>
    );
  }

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Alarms
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="ml-2"
          onClick={() => {
            setCreateAlarmOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Create Alarm
        </Button>
      </div>
      <h3 className="text-muted-foreground -mt-2 text-sm">
        Manage your device&#39;s alarms below.
      </h3>
      <Card className="w-full p-0">
        <ul className="divide-border divide-y">
          {alarms.map((alarm) => (
            <li
              key={alarm.id}
              className={`flex items-start justify-between px-4 py-6 ${
                formatCronExpressionWithStartEnd(alarm).isExpired
                  ? "opacity-60"
                  : ""
              }`}
            >
              <div className="flex w-full min-w-0 flex-col gap-3">
                {/* Status badges */}
                <div className="flex items-center gap-2">
                  {alarm.syncStatus !== "SYNCED" && (
                    <Badge
                      variant={
                        alarm.syncStatus === "ERROR"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {alarm.syncStatus}
                    </Badge>
                  )}
                  {formatCronExpressionWithStartEnd(alarm).isExpired && (
                    <Badge variant="outline" className="text-muted-foreground">
                      EXPIRED
                    </Badge>
                  )}
                  {alarm.lastSync && (
                    <span className="text-muted-foreground text-xs">
                      Last sync{" "}
                      {formatDistanceToNow(new Date(alarm.lastSync), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>

                {/* Title and description */}
                <div>
                  <h3 className="text-foreground truncate text-lg font-semibold">
                    {alarm.title}
                  </h3>
                  {alarm.description && (
                    <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
                      {alarm.description}
                    </p>
                  )}
                </div>

                {/* Properties */}
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Flag className="text-muted-foreground h-4 w-4" />
                    <span className="text-muted-foreground text-xs font-medium">
                      Severity:
                    </span>
                    <Badge variant="outline">
                      {formatSeverityLevel(alarm.severityLevel)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Vibrate className="text-muted-foreground h-4 w-4" />
                    <span className="text-muted-foreground text-xs font-medium">
                      Vibration:
                    </span>
                    <Badge variant="outline">
                      {formatVibrationIntensity(alarm.vibrationIntensity)}{" "}
                      (Pattern {alarm.vibrationPattern})
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Palette className="text-muted-foreground h-4 w-4" />
                    <span className="text-muted-foreground text-xs font-medium">
                      LED:
                    </span>
                    <div className="flex items-center gap-1">
                      <div
                        className="h-4 w-4 rounded-full border shadow-sm"
                        style={{
                          backgroundColor: getLedColorValue(alarm.ledColor),
                        }}
                        title={formatLedColor(alarm.ledColor)}
                      />
                      <Badge variant="outline" className="text-xs">
                        {formatLedPattern(alarm.ledPattern)}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Cron expressions and schedule information */}
                <div className="space-y-2">
                  {(() => {
                    const scheduleInfo =
                      formatCronExpressionWithStartEnd(alarm);
                    return (
                      <>
                        <div className="border-accent bg-accent/60 text-foreground rounded-md border px-3 py-2">
                          <div className="text-sm font-medium">
                            {scheduleInfo.cronDescription}
                          </div>
                          <div className="text-muted-foreground mt-1 font-mono text-xs">
                            {alarm.cronExpression} (debug)
                          </div>
                        </div>

                        {/* Start and End date information */}
                        <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
                          {scheduleInfo.startInfo && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{scheduleInfo.startInfo}</span>
                            </div>
                          )}
                          {scheduleInfo.endInfo && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span
                                className={
                                  scheduleInfo.isExpired
                                    ? "text-destructive"
                                    : ""
                                }
                              >
                                {scheduleInfo.endInfo}
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground h-auto p-0"
                    onClick={() => handleEdit(alarm)}
                    type="button"
                  >
                    <Edit className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-auto p-0"
                    onClick={() => handleDelete(alarm)}
                    type="button"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
          {alarms.length === 0 && (
            <li className="text-muted-foreground px-4 py-8 text-center">
              <div className="flex flex-col items-center gap-2">
                <Plus className="text-muted-foreground h-8 w-8" />
                <p className="text-sm">No alarms found.</p>
                <p className="text-xs">
                  Create your first alarm to get started.
                </p>
              </div>
            </li>
          )}
        </ul>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alarm?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Are you sure you want to delete this
              alarm?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!editAlarm} onOpenChange={() => setEditAlarm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Alarm</DialogTitle>
          </DialogHeader>
          {editAlarm && (
            <AlarmEditForm
              alarm={editAlarm}
              mode="edit"
              alarmId={editAlarm.id}
              onClose={() => setEditAlarm(null)}
              onSuccess={() => {
                setEditAlarm(null);
                void queryClient.invalidateQueries({
                  queryKey: trpc.device.getById.queryKey({ id: deviceId }),
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={createAlarmOpen} onOpenChange={setCreateAlarmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Alarm</DialogTitle>
          </DialogHeader>
          {device?.userId && (
            <AlarmEditForm
              mode="create"
              deviceId={deviceId}
              userId={device.userId}
              onClose={() => setCreateAlarmOpen(false)}
              onSuccess={() => {
                setCreateAlarmOpen(false);
                void queryClient.invalidateQueries({
                  queryKey: trpc.device.getById.queryKey({ id: deviceId }),
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
