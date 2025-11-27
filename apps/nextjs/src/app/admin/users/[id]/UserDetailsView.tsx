"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Smartphone, User as UserIcon } from "lucide-react";

import { Badge } from "~/_components/ui/badge";
import { Button } from "~/_components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/_components/ui/card";
import { Separator } from "~/_components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/_components/ui/table";
import { AlarmCard } from "~/components/alarms/AlarmCard";
import { useTRPC } from "~/trpc/react";
import { formatCronExpressionWithStartEnd } from "~/utils/alarmFormatters";

interface UserDetailsViewProps {
  userId: string;
}

export function UserDetailsView({ userId }: UserDetailsViewProps) {
  const router = useRouter();
  const trpc = useTRPC();

  const {
    data: user,
    isLoading,
    error,
  } = useQuery(trpc.admin.getUserById.queryOptions({ id: userId }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-muted h-8 w-32 animate-pulse rounded" />
        <div className="bg-muted h-48 animate-pulse rounded" />
        <div className="bg-muted h-64 animate-pulse rounded" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <p className="text-destructive mb-4">
            {error ? `Error loading user: ${error.message}` : "User not found"}
          </p>
          <Button onClick={() => router.push("/admin/users")}>
            Back to Users
          </Button>
        </div>
      </div>
    );
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case "SYNCED":
        return "bg-green-100 text-green-800";
      case "SYNCING":
        return "bg-yellow-100 text-yellow-800";
      case "ERROR":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/admin/users")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Button>
      </div>

      {/* User Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-muted rounded-full p-2">
              <UserIcon className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                {user.name}
                <Badge variant={user.isAdmin ? "default" : "secondary"}>
                  {user.isAdmin ? "Admin" : "User"}
                </Badge>
              </CardTitle>
              <p className="text-muted-foreground text-sm">{user.email}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium">User ID</p>
              <p className="text-muted-foreground font-mono text-sm">
                {user.id}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Created</p>
              <p className="text-muted-foreground text-sm">
                {formatDate(user.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Last Updated</p>
              <p className="text-muted-foreground text-sm">
                {formatDate(user.updatedAt)}
              </p>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <Smartphone className="text-muted-foreground h-4 w-4" />
              <span className="text-sm">
                <strong>{user._count.devices}</strong> device
                {user._count.devices !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="text-muted-foreground h-4 w-4" />
              <span className="text-sm">
                <strong>{user._count.alarms}</strong> alarm
                {user._count.alarms !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Devices */}
      <Card>
        <CardHeader>
          <CardTitle>Devices ({user.devices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {user.devices.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              No devices found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Alarms</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Sync Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">
                      {device.title}
                    </TableCell>
                    <TableCell>{device.description}</TableCell>
                    <TableCell>{device._count.alarms}</TableCell>
                    <TableCell>{device.batteryLevel}%</TableCell>
                    <TableCell>
                      <Badge
                        className={getSyncStatusColor(device.syncStatus)}
                        variant="secondary"
                      >
                        {device.syncStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(device.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Alarms */}
      <Card>
        <CardHeader>
          <CardTitle>Alarms ({user.alarms.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {user.alarms.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              No alarms found.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {user.alarms.map((alarm) => (
                <li key={alarm.id} className="py-6">
                  <AlarmCard
                    alarm={alarm}
                    formatCronExpressionWithStartEnd={
                      formatCronExpressionWithStartEnd
                    }
                    showExpiredBadge={true}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
