"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DevicesCard } from "~/_components/dashboard/DevicesCard";
import { Skeleton } from "~/_components/ui/skeleton";
import { useTRPC } from "~/trpc/react";

export function DashboardContent() {
  const t = useTranslations();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Query devices with refetchOnMount to ensure fresh data every time
  const {
    data: devices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    ...trpc.device.getAll.queryOptions({}),
    refetchOnMount: "always", // Always refetch when component mounts
    refetchOnWindowFocus: true, // Also refetch when window gains focus
    staleTime: 0, // Consider data stale immediately
    gcTime: 0, // No garbage collection time - data removed immediately
  });

  // Invalidate and refetch devices data whenever we navigate to dashboard
  useEffect(() => {
    // Invalidate the devices query to ensure fresh data
    void queryClient.invalidateQueries({
      queryKey: trpc.device.getAll.queryKey({}),
    });

    // Force refetch
    void refetch();
  }, [queryClient, refetch, trpc.device.getAll]); // Include dependencies

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-8">
        <div className="border-destructive/20 bg-destructive/10 rounded-lg border p-4">
          <p className="text-destructive text-sm">
            {t("dashboard.errorLoadingDevices")}: {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <DevicesCard devices={devices ?? []} />
    </div>
  );
}
