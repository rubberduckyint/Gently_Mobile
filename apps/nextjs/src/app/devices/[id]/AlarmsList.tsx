"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";

import { Card } from "~/_components/ui/card";
import { Skeleton } from "~/_components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/_components/ui/tabs";
import { AlarmCard } from "~/components/alarms/AlarmCard";
import { useTRPC } from "~/trpc/react";
import { formatCronExpressionWithStartEnd } from "~/utils/alarmFormatters";

interface AlarmsListProps {
  deviceId: string;
}

export default function AlarmsList({ deviceId }: AlarmsListProps) {
  const trpc = useTRPC();
  const [activeTab, setActiveTab] = useState<"active" | "expired">("active");

  // Fetch alarms for this device
  const {
    data: device,
    isLoading,
    isError,
  } = useQuery(trpc.device.getById.queryOptions({ id: deviceId }));
  const alarms = device?.alarms ?? [];

  // Separate active and expired alarms
  const activeAlarms = alarms.filter(
    (alarm) => !formatCronExpressionWithStartEnd(alarm).isExpired,
  );
  const expiredAlarms = alarms.filter(
    (alarm) => formatCronExpressionWithStartEnd(alarm).isExpired,
  );

  if (isLoading) {
    return (
      <>
        <div className="mt-4 flex items-center gap-2">
          <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Alarms
          </h2>
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
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-foreground text-xl font-semibold">Alarms</h2>
          <p className="text-muted-foreground text-sm">Read-only view</p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "active" | "expired")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">
              Active ({activeAlarms.length})
            </TabsTrigger>
            <TabsTrigger value="expired">
              Expired ({expiredAlarms.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            <ul className="divide-border divide-y">
              {activeAlarms.map((alarm) => (
                <li key={alarm.id} className="px-4 py-6">
                  <AlarmCard
                    alarm={alarm}
                    formatCronExpressionWithStartEnd={
                      formatCronExpressionWithStartEnd
                    }
                    showExpiredBadge={false}
                  />
                </li>
              ))}
              {activeAlarms.length === 0 && (
                <li className="text-muted-foreground px-4 py-8 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Clock className="text-muted-foreground h-8 w-8" />
                    <p className="text-sm">No active alarms.</p>
                    <p className="text-xs">
                      Use the mobile app to create and manage alarms.
                    </p>
                  </div>
                </li>
              )}
            </ul>
          </TabsContent>

          <TabsContent value="expired" className="mt-4">
            <ul className="divide-border divide-y">
              {expiredAlarms.map((alarm) => (
                <li key={alarm.id} className="px-4 py-6 opacity-60">
                  <AlarmCard
                    alarm={alarm}
                    formatCronExpressionWithStartEnd={
                      formatCronExpressionWithStartEnd
                    }
                    showExpiredBadge={true}
                  />
                </li>
              ))}
              {expiredAlarms.length === 0 && (
                <li className="text-muted-foreground px-4 py-8 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Clock className="text-muted-foreground h-8 w-8" />
                    <p className="text-sm">No expired alarms.</p>
                  </div>
                </li>
              )}
            </ul>
          </TabsContent>
        </Tabs>
      </Card>
    </>
  );
}
