"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronRight,
  Eye,
  Home,
  Lock,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  User,
  Users,
  Watch,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "~/_components/ui/badge";
import { Button } from "~/_components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/_components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/_components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/_components/ui/dropdown-menu";
import { Input } from "~/_components/ui/input";
import { Label } from "~/_components/ui/label";
import { Skeleton } from "~/_components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "~/_components/ui/toggle-group";
import { useTRPC } from "~/trpc/react";

export function ShareDeviceContent({ deviceId }: { deviceId: string }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [permission, setPermission] = useState<"READ" | "WRITE">("READ");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<{
    shareId: string;
    email: string;
  } | null>(null);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Get device details
  const { data: device, isLoading: deviceLoading } = useQuery({
    ...trpc.device.getById.queryOptions({ id: deviceId }),
  });

  // Get shares for this device
  const {
    data: allShares,
    isLoading: sharesLoading,
    refetch: refetchShares,
  } = useQuery({
    ...trpc.deviceShare.getMyDeviceShares.queryOptions(),
  });

  const shares = allShares?.filter((s) => s.deviceId === deviceId) ?? [];

  // Invite mutation
  const inviteMutation = useMutation({
    ...trpc.deviceShare.invite.mutationOptions({
      onSuccess: (result) => {
        setInviteEmail("");
        setIsInviteDialogOpen(false);
        void refetchShares();
        toast.success(
          result.isNewUser
            ? `Invitation sent to ${inviteEmail}. They'll need to create an account.`
            : `${inviteEmail} has been invited to access this device.`,
        );
      },
      onError: (error) => {
        toast.error(error.message || "Failed to send invitation");
      },
    }),
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    ...trpc.deviceShare.revokeAccess.mutationOptions({
      onSuccess: () => {
        setConfirmRevoke(null);
        void refetchShares();
        void queryClient.invalidateQueries({
          queryKey: trpc.device.getAll.queryKey({}),
        });
        toast.success("Access revoked successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to revoke access");
      },
    }),
  });

  // Update permission mutation
  const updateMutation = useMutation({
    ...trpc.deviceShare.update.mutationOptions({
      onSuccess: () => {
        void refetchShares();
        toast.success("Permission updated");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update permission");
      },
    }),
  });

  // Resend invitation mutation
  const resendMutation = useMutation({
    ...trpc.deviceShare.resendInvitation.mutationOptions({
      onSuccess: () => {
        toast.success("Invitation resent");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to resend invitation");
      },
    }),
  });

  const handleInvite = () => {
    if (!inviteEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    inviteMutation.mutate({
      deviceId,
      invitedEmail: inviteEmail.trim().toLowerCase(),
      permission,
    });
  };

  const handleTogglePermission = (
    shareId: string,
    currentPermission: "READ" | "WRITE",
  ) => {
    const newPermission = currentPermission === "READ" ? "WRITE" : "READ";
    updateMutation.mutate({ id: shareId, permission: newPermission });
  };

  // Check if user is owner
  if (device && !device.isOwned) {
    return (
      <div className="mx-auto max-w-2xl">
        <Breadcrumb deviceId={deviceId} deviceTitle={device.title} />
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Lock className="text-muted-foreground mb-4 h-12 w-12" />
            <h3 className="text-lg font-semibold">
              Only the device owner can manage sharing
            </h3>
            <p className="text-muted-foreground mt-2 text-center text-sm">
              Contact the device owner if you need to make changes to sharing
              settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (deviceLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-2">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mb-4 h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb deviceId={deviceId} deviceTitle={device?.title} />

      {/* Invite Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share Device
          </CardTitle>
          <CardDescription>
            Invite others to access {device?.title ?? "this device"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setIsInviteDialogOpen(true)}>
            <Send className="h-4 w-4" />
            Invite Someone
          </Button>
        </CardContent>
      </Card>

      {/* People with Access */}
      <Card>
        <CardHeader>
          <CardTitle>People with Access</CardTitle>
          <CardDescription>
            {shares.length === 0
              ? "No one else has access to this device yet"
              : `${shares.length} ${shares.length === 1 ? "person has" : "people have"} access`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sharesLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : shares.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <Users className="text-muted-foreground mb-4 h-12 w-12" />
              <p className="text-muted-foreground text-center text-sm">
                No one else has access to this device yet.
                <br />
                Click &quot;Invite Someone&quot; to share access.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full">
                      {share.sharedWithUser?.image ? (
                        <Image
                          src={share.sharedWithUser.image}
                          alt=""
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <User className="h-5 w-5" />
                      )}
                    </div>

                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {share.sharedWithUser?.name ?? share.invitedEmail}
                        </span>
                        <Badge
                          variant={
                            share.status === "ACCEPTED"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {share.status}
                        </Badge>
                        <Badge
                          variant={
                            share.permission === "WRITE" ? "default" : "outline"
                          }
                        >
                          {share.permission === "WRITE" ? (
                            <>
                              <Pencil className="mr-1 h-3 w-3" />
                              Full Access
                            </>
                          ) : (
                            <>
                              <Eye className="mr-1 h-3 w-3" />
                              View Only
                            </>
                          )}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {share.invitedEmail}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Invited{" "}
                        {formatDistanceToNow(new Date(share.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          handleTogglePermission(share.id, share.permission)
                        }
                      >
                        {share.permission === "WRITE" ? (
                          <>
                            <Eye className="h-4 w-4" />
                            Change to View Only
                          </>
                        ) : (
                          <>
                            <Pencil className="h-4 w-4" />
                            Change to Full Access
                          </>
                        )}
                      </DropdownMenuItem>
                      {share.status === "PENDING" && (
                        <DropdownMenuItem
                          onClick={() =>
                            resendMutation.mutate({ shareId: share.id })
                          }
                        >
                          <RefreshCw className="h-4 w-4" />
                          Resend Invitation
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() =>
                          setConfirmRevoke({
                            shareId: share.id,
                            email: share.invitedEmail,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        Revoke Access
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Someone</DialogTitle>
            <DialogDescription>
              Enter an email address to invite someone to access this device.
              They&apos;ll receive an invitation to accept.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Permission Level</Label>
              <ToggleGroup
                type="single"
                value={permission}
                onValueChange={(v) => v && setPermission(v as "READ" | "WRITE")}
                className="grid grid-cols-2 gap-2"
              >
                <ToggleGroupItem
                  value="READ"
                  className="flex flex-col items-center gap-1 py-4"
                  variant="outline"
                >
                  <Eye className="h-5 w-5" />
                  <span className="font-medium">View Only</span>
                  <span className="text-muted-foreground text-xs">
                    Can view alarms
                  </span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="WRITE"
                  className="flex flex-col items-center gap-1 py-4"
                  variant="outline"
                >
                  <Pencil className="h-5 w-5" />
                  <span className="font-medium">Full Access</span>
                  <span className="text-muted-foreground text-xs">
                    Can modify alarms
                  </span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsInviteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
            >
              {inviteMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Invitation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog
        open={!!confirmRevoke}
        onOpenChange={(open) => !open && setConfirmRevoke(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Access</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {confirmRevoke?.email}&apos;s
              access to this device? They will no longer be able to view or
              manage alarms.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                confirmRevoke &&
                revokeMutation.mutate({ shareId: confirmRevoke.shareId })
              }
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Breadcrumb({
  deviceId,
  deviceTitle,
}: {
  deviceId: string;
  deviceTitle?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="mb-2 flex scroll-m-20 items-center gap-2 text-2xl font-semibold tracking-tight">
        <Link
          href="/dashboard"
          className="hover:text-foreground flex items-center gap-1"
        >
          <Home className="h-6 w-6" />
        </Link>
        <ChevronRight className="text-muted-foreground h-4 w-4" />
        <Link
          href={`/devices/${deviceId}`}
          className="hover:text-foreground flex items-center gap-1"
        >
          <Watch className="h-5 w-5" />
          <span>{deviceTitle ?? "Device"}</span>
        </Link>
        <ChevronRight className="text-muted-foreground h-4 w-4" />
        <span>Share</span>
      </h2>
      <h3 className="text-muted-foreground mb-4 text-sm">
        Manage who has access to this device.
      </h3>
    </div>
  );
}
