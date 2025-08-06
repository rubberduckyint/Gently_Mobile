"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { Device } from "@acme/db";

import { Button } from "~/_components/ui/button";
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

// Type for the device data returned by tRPC getById query
// type DeviceWithAlarms = Device & {
//   alarms: Alarm[];
//   _count: {
//     alarms: number;
//   };
// };

const deviceSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(50),
  description: z
    .string()
    .min(2, "Description must be at least 2 characters")
    .max(128),
});
type DeviceFormValues = z.infer<typeof deviceSchema>;

export default function DeviceForm({
  device,
  onSaveAction,
}: {
  device: Device; // Properly type the device parameter
  onSaveAction?: () => void; // Renamed to indicate Server Action
}) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const form = useForm<DeviceFormValues>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { title: device.title, description: device.description },
  });

  const mutation = useMutation(
    trpc.device.update.mutationOptions({
      onSuccess: () => {
        toast.success("Device updated!");
        // Invalidate queries for this device
        void queryClient.invalidateQueries({
          queryKey: trpc.device.getById.queryKey({ id: device.id }),
        });
        onSaveAction?.();
      },
      onError: (error) => {
        toast.error(`Failed to update device: ${error.message}`);
      },
    }),
  );

  const onSubmit = (values: DeviceFormValues) => {
    mutation.mutate({
      id: device.id,
      ...values,
    });
  };
  return (
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
  );
}
