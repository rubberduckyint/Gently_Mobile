"use client";

import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { Device } from "@acme/db/schema";

import { Badge } from "~/_components/ui/badge";
import { Button } from "~/_components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/_components/ui/form";
import { Input } from "~/_components/ui/input";
import { Textarea } from "~/_components/ui/textarea";
import { useTRPC } from "~/trpc/react";

const deviceSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(50),
  description: z
    .string()
    .min(2, "Description must be at least 2 characters")
    .max(128),
});
type DeviceFormValues = z.infer<typeof deviceSchema>;

export default function DeviceEditDialog({
  device,
  onSave,
}: {
  device: Device;
  onSave?: () => void;
}) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const form = useForm<DeviceFormValues>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { title: device.title, description: device.description },
  });

  const mutation = useMutation(
    trpc.device.update.mutationOptions({
      onSuccess: () => {
        toast.success("Device updated!");
        setShowEditDialog(false);
        // Invalidate and refetch device data
        void queryClient.invalidateQueries({
          queryKey: trpc.device.getById.queryKey({ id: device.id }),
        });
        onSave?.();
      },
    }),
  );

  const onSubmit = (values: DeviceFormValues) => {
    console.log("Submitting device update:", values);
    mutation.mutate({ id: device.id, ...values });
  };

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            {device.title}
            <Badge variant="secondary">{device.syncStatus}</Badge>
          </CardTitle>
          <div className="text-muted-foreground mt-1 text-base">
            {device.description}
          </div>
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
      <CardContent className="flex flex-wrap gap-6 pt-2">
        <div>
          <span className="text-muted-foreground text-xs">Created</span>
          <div>
            {formatDistanceToNow(new Date(device.createdAt), {
              addSuffix: true,
            })}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Last Sync</span>
          <div>
            {device.lastSync
              ? formatDistanceToNow(
                  new Date(device.lastSync as string | number | Date),
                  { addSuffix: true },
                )
              : "Never"}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Battery</span>
          <div>{device.batteryLevel}%</div>
        </div>
      </CardContent>
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeaderUI>
            <DialogTitleUI>Edit Device</DialogTitleUI>
          </DialogHeaderUI>
          <Form {...form}>
            <form
              className="flex flex-col gap-4"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input id="title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea id="description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={mutation.status === "pending"}>
                {mutation.status === "pending" ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
