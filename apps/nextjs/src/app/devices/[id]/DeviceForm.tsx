"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { DeviceType } from "@acme/db";

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
  onSave,
}: {
  device: DeviceType;
  onSave?: () => void;
}) {
  const queryClient = useQueryClient();

  const form = useForm<DeviceFormValues>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { title: device.title, description: device.description },
  });

  const mutation = useMutation({
    mutationFn: async (values: DeviceFormValues) => {
      const response = await fetch("/api/trpc/device.update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: { id: device.id, ...values },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to update device");
      }

      return response.json() as Promise<DeviceType>;
    },
    onSuccess: () => {
      toast.success("Device updated!");
      // Invalidate queries for this device
      void queryClient.invalidateQueries({
        queryKey: ["device", "getById", { id: device.id }],
      });
      onSave?.();
    },
    onError: (error) => {
      toast.error(`Failed to update device: ${error.message}`);
    },
  });

  const onSubmit = (values: DeviceFormValues) => {
    mutation.mutate(values);
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
