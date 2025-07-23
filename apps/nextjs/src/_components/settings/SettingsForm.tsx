"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Avatar, AvatarImage } from "~/_components/ui/avatar";
import { Button } from "~/_components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/_components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/_components/ui/form";
import { Input } from "~/_components/ui/input";
import { useTRPC } from "~/trpc/react";

interface SettingsFormProps {
  name: string;
  email: string;
  image?: string;
}

interface ProfileFormValues {
  name: string;
  image?: string;
}
export default function SettingsForm({
  name: initialName,
  email,
  image,
}: SettingsFormProps) {
  const t = useTranslations();

  // Create schema with translated messages
  const profileSchema = z.object({
    name: z
      .string()
      .min(2, t("settings.validationErrors.nameMin"))
      .max(50, t("settings.validationErrors.nameMax")),
    image: z
      .string()
      .url(t("settings.validationErrors.invalidUrl"))
      .optional()
      .or(z.literal("").transform(() => undefined)),
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: initialName,
      image: image ?? "",
    },
  });

  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const mutation = useMutation(
    trpc.auth.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.getProfile.queryKey(),
        });
        toast.success(t("settings.profileUpdated"));
      },
    }),
  );

  const onSubmit = (values: ProfileFormValues) => {
    mutation.mutate(values);
  };

  return (
    <Card className="w-full rounded-lg shadow">
      <CardHeader>
        <CardTitle>{t("settings.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-6"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-col items-center gap-2">
                    <Avatar className="h-20 w-20">
                      <AvatarImage
                        src={field.value}
                        alt={form.getValues("name") || "Profile"}
                      />
                    </Avatar>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder={t("settings.profileImage")}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("settings.namePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("settings.email")}
              </label>
              <Input value={email} disabled className="bg-muted" />
            </div>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="mt-2"
            >
              {mutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
            {mutation.error && (
              <div className="text-sm text-red-600">
                {(() => {
                  if (mutation.error instanceof Error)
                    return mutation.error.message;
                  // tRPC error with zodError
                  const zodError = (
                    mutation.error as {
                      data?: {
                        zodError?: { fieldErrors?: Record<string, string[]> };
                      };
                    }
                  ).data?.zodError;
                  if (zodError?.fieldErrors) {
                    return Object.values(zodError.fieldErrors).flat().join(" ");
                  }
                  return "An error occurred.";
                })()}
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
