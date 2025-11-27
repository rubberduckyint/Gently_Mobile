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
  Eye,
  Home,
  Loader2,
  Pencil,
  RefreshCw,
  Share2,
  Users,
  XCircle,
} from "lucide-react";

import type { Device } from "@gently/db/schema";

import { Badge } from "~/_components/ui/badge";
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

  // Get shares for this device (only if owned)
  const { data: allShares } = useQuery({
    ...trpc.deviceShare.getMyDeviceShares.queryOptions(),
    enabled: !!device?.isOwned,
  });

  // Filter shares for this specific device
  const deviceShares = allShares?.filter((s) => s.deviceId === deviceId) ?? [];
  const acceptedShares = deviceShares.filter((s) => s.status === "ACCEPTED");
  const pendingShares = deviceShares.filter((s) => s.status === "PENDING");

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
          {/* Shared Device Banner - for devices shared WITH you */}
          {device.isShared && device.shareInfo && (
            <Card className="border-primary/30 bg-primary/5 -mt-4 mb-4">
              <CardContent className="flex items-center gap-3 py-3">
                <Users className="text-primary h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">
                    Shared by{" "}
                    {device.shareInfo.ownerName
                      ? device.shareInfo.ownerName
                      : device.shareInfo.ownerEmail}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    You have{" "}
                    {device.shareInfo.permission === "WRITE"
                      ? "full"
                      : "view-only"}{" "}
                    access
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sharing Status Banner - for devices YOU own */}
          {device.isOwned && deviceShares.length > 0 && (
            <a href={`/devices/${deviceId}/share`}>
              <Card className="-mt-4 mb-4 cursor-pointer border-blue-500/30 bg-blue-500/5 transition-colors hover:bg-blue-500/10">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Share2 className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">
                        Shared with {deviceShares.length}{" "}
                        {deviceShares.length === 1 ? "person" : "people"}
                      </p>
                      <div className="text-muted-foreground flex items-center gap-2 text-xs">
                        {acceptedShares.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {acceptedShares.length} active
                          </span>
                        )}
                        {pendingShares.length > 0 && (
                          <span className="flex items-center gap-1 text-amber-600">
                            • {pendingShares.length} pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Show permission breakdown */}
                    <div className="flex gap-1">
                      {acceptedShares.filter((s) => s.permission === "WRITE")
                        .length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Pencil className="mr-1 h-3 w-3" />
                          {
                            acceptedShares.filter(
                              (s) => s.permission === "WRITE",
                            ).length
                          }
                        </Badge>
                      )}
                      {acceptedShares.filter((s) => s.permission === "READ")
                        .length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Eye className="mr-1 h-3 w-3" />
                          {
                            acceptedShares.filter(
                              (s) => s.permission === "READ",
                            ).length
                          }
                        </Badge>
                      )}
                    </div>
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </a>
          )}

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
                  {device.isOwned && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Share device"
                            asChild
                          >
                            <Link href={`/devices/${deviceId}/share`}>
                              <Share2 className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Share Device</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
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
                  const BatteryIcon = getBatteryIcon(device.batteryLevel ?? 0);
                  const batteryColor = getBatteryColor(device.batteryLevel ?? 0);
                  return (
                    <span className="flex items-center gap-1">
                      <BatteryIcon className={`h-4 w-4 ${batteryColor}`} />
                      <span className={batteryColor}>
                        {device.batteryLevel ?? 0}%
                      </span>
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
