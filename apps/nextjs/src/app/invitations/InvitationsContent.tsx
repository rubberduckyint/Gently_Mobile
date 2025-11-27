"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Check,
  ChevronRight,
  Eye,
  Home,
  Mail,
  Pencil,
  User,
  Watch,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "~/_components/ui/badge";
import { Button } from "~/_components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/_components/ui/card";
import { Skeleton } from "~/_components/ui/skeleton";
import { useTRPC } from "~/trpc/react";

export function InvitationsContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const {
    data: invitations,
    isLoading,
    error,
  } = useQuery({
    ...trpc.deviceShare.getPendingInvitations.queryOptions(),
    refetchOnMount: "always",
  });

  const respondMutation = useMutation({
    ...trpc.deviceShare.respondToInvitation.mutationOptions({
      onSuccess: (_, variables) => {
        void queryClient.invalidateQueries({
          queryKey: trpc.deviceShare.getPendingInvitations.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.device.getAll.queryKey({}),
        });
        toast.success(
          variables.accept
            ? "Invitation accepted! You can now view this device."
            : "Invitation declined.",
        );
      },
      onError: (error) => {
        toast.error(
          "message" in error
            ? String(error.message)
            : "Failed to respond to invitation",
        );
      },
    }),
  });

  const handleRespond = (shareId: string, accept: boolean) => {
    respondMutation.mutate({ shareId, accept });
  };

  return (
    <div className="mx-auto flex w-full flex-col gap-6">
      {/* Breadcrumb */}
      <div>
        <h2 className="mb-2 flex scroll-m-20 items-center gap-2 text-2xl font-semibold tracking-tight">
          <Link
            href="/dashboard"
            className="hover:text-foreground flex items-center gap-1"
          >
            <Home className="h-6 w-6" />
          </Link>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
          <span>Invitations</span>
        </h2>
        <p className="text-muted-foreground text-sm">
          View and respond to device sharing invitations.
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-destructive text-center">
              Failed to load invitations: {error.message}
            </div>
          </CardContent>
        </Card>
      ) : !invitations || invitations.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
                <Mail className="text-muted-foreground h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  No Pending Invitations
                </h3>
                <p className="text-muted-foreground text-sm">
                  When someone shares a device with you, the invitation will
                  appear here.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            You have {invitations.length} pending invitation
            {invitations.length !== 1 ? "s" : ""}
          </p>

          {invitations.map((invitation) => (
            <Card key={invitation.id} className="overflow-hidden">
              <div className="bg-primary h-1" />
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-lg">
                      <Watch className="text-primary h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {invitation.device.title || "Gently Device"}
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Serial: {invitation.device.serialNumber}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      invitation.permission === "WRITE"
                        ? "default"
                        : "secondary"
                    }
                    className="flex items-center gap-1"
                  >
                    {invitation.permission === "WRITE" ? (
                      <>
                        <Pencil className="h-3 w-3" />
                        Read & Write
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" />
                        Read Only
                      </>
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Shared by info */}
                  <div className="flex items-center gap-2 text-sm">
                    <User className="text-muted-foreground h-4 w-4" />
                    <span className="text-muted-foreground">Shared by:</span>
                    <span className="font-medium">
                      {invitation.invitedByUser.email}
                    </span>
                  </div>

                  {/* Permission description */}
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-muted-foreground text-sm">
                      {invitation.permission === "WRITE"
                        ? "You will be able to view the device and create or modify alarms."
                        : "You will be able to view the device and its alarms, but not modify them."}
                    </p>
                  </div>

                  {/* Created time */}
                  <p className="text-muted-foreground text-xs">
                    Invited{" "}
                    {formatDistanceToNow(new Date(invitation.createdAt), {
                      addSuffix: true,
                    })}
                  </p>

                  {/* Action buttons */}
                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleRespond(invitation.id, false)}
                      disabled={respondMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                      Decline
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => handleRespond(invitation.id, true)}
                      disabled={respondMutation.isPending}
                    >
                      <Check className="h-4 w-4" />
                      Accept
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
