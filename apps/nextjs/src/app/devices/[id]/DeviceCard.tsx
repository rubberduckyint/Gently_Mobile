"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Home,
  Loader2,
  Pencil,
  RefreshCw,
  XCircle,
} from "lucide-react";

import type { Device } from "@gently/db/schema";

import { Button } from "~/_components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/_components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader as DialogHeaderUI,
  DialogTitle as DialogTitleUI,
} from "~/_components/ui/dialog";
import { Skeleton } from "~/_components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/_components/ui/tooltip";
import { useTRPC } from "~/trpc/react";
import DeviceForm from "./DeviceForm";

// Helper function to get sync status display info
function getSyncStatusInfo(syncStatus: string, lastSync: Date | string | null) {
  switch (syncStatus) {
    case "SYNCED":
      return {
        icon: CheckCircle2,
        color: "text-green-600",
        bgColor: "bg-green-50",
        borderColor: "border-green-200",
        label: "Synced",
        description: lastSync
          ? `Last synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
          : "All alarms synced to device",
      };
    case "SYNCING":
      return {
        icon: Loader2,
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
        label: "Syncing",
        description: "Syncing alarms to device...",
        animate: true,
      };
    case "NOT_SYNCED":
      return {
        icon: Clock,
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200",
        label: "Pending Sync",
        description: "Changes waiting to sync to device",
      };
    case "ERROR":
      return {
        icon: XCircle,
        color: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        label: "Sync Error",
        description: "Failed to sync. Connect device to retry.",
      };
    default:
      return {
        icon: RefreshCw,
        color: "text-gray-500",
        bgColor: "bg-gray-50",
        borderColor: "border-gray-200",
        label: syncStatus,
        description: "Unknown sync status",
      };
  }
}

// Helper function to get battery icon based on level
function getBatteryIcon(level: number) {
  if (level <= 20) return BatteryLow;
  if (level <= 50) return BatteryMedium;
  return BatteryFull;
}

function getBatteryColor(level: number) {
  if (level <= 20) return "text-red-500";
  if (level <= 50) return "text-amber-500";
  return "text-green-500";
}

export function DeviceCard({ deviceId }: { deviceId: string }) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const {
    data: device,
    isLoading,
    error,
    isError,
  } = useQuery(
    trpc.device.getById.queryOptions({
      id: deviceId,
    }),
  );

  const handleSave = async () => {
    setShowEditDialog(false);
    await queryClient.invalidateQueries({
      queryKey: trpc.device.getById.queryKey({ id: deviceId }),
    });
  };

  return (
    <>
      <div>
        <h2 className="mb-2 flex scroll-m-20 items-center gap-2 text-2xl font-semibold tracking-tight">
          <Link
            href="/dashboard"
            className="hover:text-foreground flex items-center gap-1"
          >
            <Home className="h-6 w-6" />
          </Link>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
          <span>Device Details</span>
        </h2>
        <h3 className="text-muted-foreground mb-4 text-sm">
          Manage your device&#39;s details below.
        </h3>
      </div>

      {isLoading ? (
        <Card className="-mt-4">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="flex gap-6">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card className="-mt-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold">Error Loading Device</h3>
              <p className="text-muted-foreground text-sm">
                {error.message || "Failed to load device details."}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                Device ID: {deviceId}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : !device ? (
        <Card className="-mt-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold">Device Not Found</h3>
              <p className="text-muted-foreground text-sm">
                The device you&apos;re looking for doesn&apos;t exist.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="-mt-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                {/* Sync Status Badge */}
                {(() => {
                  const statusInfo = getSyncStatusInfo(
                    device.syncStatus,
                    device.lastSync,
                  );
                  const StatusIcon = statusInfo.icon;
                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${statusInfo.bgColor} ${statusInfo.borderColor}`}
                          >
                            <StatusIcon
                              className={`h-4 w-4 ${statusInfo.color} ${statusInfo.animate ? "animate-spin" : ""}`}
                            />
                            <span
                              className={`text-sm font-medium ${statusInfo.color}`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{statusInfo.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
                <CardTitle className="flex items-center gap-2 py-2 text-2xl font-bold">
                  {device.title}
                </CardTitle>
                <CardDescription>{device.description}</CardDescription>
              </div>
              <CardAction>
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit device"
                          onClick={() => setShowEditDialog(true)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit Device</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground flex items-center gap-6 text-sm">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Created{" "}
                  {format(new Date(device.createdAt), "MMMM d, yyyy, h:mm a")}
                </span>
                {(() => {
                  const batteryLevel = device.batteryLevel;
                  const BatteryIcon = getBatteryIcon(batteryLevel);
                  const batteryColor = getBatteryColor(batteryLevel);
                  return (
                    <span className="flex items-center gap-1">
                      <BatteryIcon className={`h-4 w-4 ${batteryColor}`} />
                      <span className={batteryColor}>{batteryLevel}%</span>
                    </span>
                  );
                })()}
              </div>
            </CardContent>
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogContent>
                <DialogHeaderUI>
                  <DialogTitleUI>Edit Device</DialogTitleUI>
                </DialogHeaderUI>
                <DeviceForm
                  device={device as Device}
                  onSaveAction={handleSave}
                />
              </DialogContent>
            </Dialog>
          </Card>
        </>
      )}
    </>
  );
}
