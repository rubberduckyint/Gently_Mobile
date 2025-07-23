"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { BatteryFull, Calendar, MoreHorizontal } from "lucide-react";

import type { DeviceType } from "@acme/db";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/_components/ui/dropdown-menu";
import { Skeleton } from "~/_components/ui/skeleton";
import { useTRPC } from "~/trpc/react";
import DeviceForm from "./DeviceForm";

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

  console.log("Device query result:", {
    device,
    isLoading,
    error,
    isError,
    deviceId,
  });

  return (
    <>
      <div>
        <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Device Details
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
        <Card className="-mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <div className="mb-1">
                <Badge
                  variant={
                    device.syncStatus === "SYNCED"
                      ? "default"
                      : device.syncStatus === "ERROR"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {device.syncStatus}
                </Badge>
                {device.lastSync && (
                  <span className="text-muted-foreground ml-2 text-xs">
                    Last sync{" "}
                    {formatDistanceToNow(new Date(device.lastSync), {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </div>
              <CardTitle className="flex items-center gap-2 py-2 text-2xl font-bold">
                {device.title}
              </CardTitle>
              <CardDescription>{device.description}</CardDescription>
            </div>
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Device actions"
                    onClick={() => setShowEditDialog(true)}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                    Edit Device
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground flex items-center gap-6 text-sm">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Created{" "}
                {device.createdAt
                  ? format(new Date(device.createdAt), "MMMM d, yyyy, h:mm a")
                  : "-"}
              </span>
              <span className="flex items-center gap-1">
                <BatteryFull className="h-4 w-4" />
                {device.batteryLevel ?? "-"}%
              </span>
            </div>
          </CardContent>
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent>
              <DialogHeaderUI>
                <DialogTitleUI>Edit Device</DialogTitleUI>
              </DialogHeaderUI>
              <DeviceForm device={device as DeviceType} onSave={handleSave} />
            </DialogContent>
          </Dialog>
        </Card>
      )}
    </>
  );
}
