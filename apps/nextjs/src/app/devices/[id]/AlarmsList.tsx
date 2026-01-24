"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Pencil, Plus } from "lucide-react";

import { AlarmEditForm } from "~/_components/alarm/AlarmEditForm";
import { Button } from "~/_components/ui/button";
import { Card } from "~/_components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/_components/ui/dialog";
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
  const [editingAlarm, setEditingAlarm] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch alarms for this device
  const {
    data: device,
    isLoading,
    isError,
    refetch,
  } = useQuery(trpc.device.getById.queryOptions({ id: deviceId }));
  const alarms = device?.alarms ?? [];

  // Separate active and expired alarms
  const activeAlarms = alarms.filter(
    (alarm) => !formatCronExpressionWithStartEnd(alarm).isExpired,
  );
  const expiredAlarms = alarms.filter(
    (alarm) => formatCronExpressionWithStartEnd(alarm).isExpired,
  );

  const handleAlarmSaved = () => {
    setEditingAlarm(null);
    setIsCreating(false);
    void refetch();
  };

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
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" />
            New Alarm
          </Button>
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <AlarmCard
                        alarm={alarm}
                        formatCronExpressionWithStartEnd={
                          formatCronExpressionWithStartEnd
                        }
                        showExpiredBadge={false}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setEditingAlarm(alarm.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
              {activeAlarms.length === 0 && (
                <li className="text-muted-foreground px-4 py-8 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Clock className="text-muted-foreground h-8 w-8" />
                    <p className="text-sm">No active alarms.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCreating(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Create your first alarm
                    </Button>
                  </div>
                </li>
              )}
            </ul>
          </TabsContent>

          <TabsContent value="expired" className="mt-4">
            <ul className="divide-border divide-y">
              {expiredAlarms.map((alarm) => (
                <li key={alarm.id} className="px-4 py-6 opacity-60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <AlarmCard
                        alarm={alarm}
                        formatCronExpressionWithStartEnd={
                          formatCronExpressionWithStartEnd
                        }
                        showExpiredBadge={true}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setEditingAlarm(alarm.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
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

      {/* Edit Alarm Dialog */}
      <Dialog
        open={!!editingAlarm}
        onOpenChange={(open) => !open && setEditingAlarm(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Alarm</DialogTitle>
          </DialogHeader>
          {editingAlarm && (
            <AlarmEditForm
              deviceId={deviceId}
              alarm={alarms.find((a) => a.id === editingAlarm)}
              onClose={() => setEditingAlarm(null)}
              onSuccess={handleAlarmSaved}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create Alarm Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Alarm</DialogTitle>
          </DialogHeader>
          <AlarmEditForm
            deviceId={deviceId}
            onClose={() => setIsCreating(false)}
            onSuccess={handleAlarmSaved}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
