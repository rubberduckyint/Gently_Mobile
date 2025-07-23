import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import {
  Alarm,
  AlarmListSchema,
  AlarmSelectSchema,
  AlarmWhereUniqueSchema,
  CreateAlarmSchema,
  Device,
  UpdateAlarmSchema,
} from "@acme/db";

import { protectedProcedure } from "../trpc";

export const alarmRouter = {
  // Get all alarms for current user
  getAll: protectedProcedure
    .input(z.object({}))
    .output(AlarmListSchema)
    .query(async ({ ctx }) => {
      return await ctx.db.query.Alarm.findMany({
        where: eq(Alarm.userId, ctx.session.user.id),
        with: {
          device: true,
        },
      });
    }),

  // Get alarm by ID (only if it belongs to the current user)
  getById: protectedProcedure
    .input(AlarmWhereUniqueSchema)
    .output(AlarmSelectSchema)
    .query(async ({ input, ctx }) => {
      const alarm = await ctx.db.query.Alarm.findFirst({
        where: and(
          eq(Alarm.id, input.id),
          eq(Alarm.userId, ctx.session.user.id),
        ),
      });

      if (!alarm) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alarm not found or you don't have permission to access it",
        });
      }

      return alarm;
    }),

  // Create alarm for current user
  create: protectedProcedure
    .input(CreateAlarmSchema)
    .output(AlarmSelectSchema)
    .mutation(async ({ input, ctx }) => {
      // If deviceId is provided, verify it belongs to the current user
      if (input.deviceId) {
        const device = await ctx.db.query.Device.findFirst({
          where: and(
            eq(Device.id, input.deviceId),
            eq(Device.userId, ctx.session.user.id),
          ),
        });

        if (!device) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Device not found or you don't have permission to use it",
          });
        }
      }

      const result = await ctx.db
        .insert(Alarm)
        .values({
          ...input,
          userId: ctx.session.user.id,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
        })
        .returning();

      if (!result[0]) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create alarm",
        });
      }
      return result[0];
    }),

  // Update alarm (only by owner)
  update: protectedProcedure
    .input(UpdateAlarmSchema)
    .output(AlarmSelectSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      // Check if alarm exists and belongs to current user
      const existingAlarm = await ctx.db.query.Alarm.findFirst({
        where: and(eq(Alarm.id, id), eq(Alarm.userId, ctx.session.user.id)),
      });

      if (!existingAlarm) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alarm not found",
        });
      }

      // If deviceId is being updated, verify the new device belongs to the current user
      if (data.deviceId) {
        const device = await ctx.db.query.Device.findFirst({
          where: and(
            eq(Device.id, data.deviceId),
            eq(Device.userId, ctx.session.user.id),
          ),
        });

        if (!device) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Device not found or you don't have permission to use it",
          });
        }
      }

      const result = await ctx.db
        .update(Alarm)
        .set({
          ...data,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
        })
        .where(eq(Alarm.id, id))
        .returning();

      return result[0] ?? existingAlarm;
    }),

  // Delete alarm (only if it belongs to the current user)
  delete: protectedProcedure
    .input(AlarmWhereUniqueSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // First check if the alarm belongs to the current user
      const existingAlarm = await ctx.db.query.Alarm.findFirst({
        where: and(
          eq(Alarm.id, input.id),
          eq(Alarm.userId, ctx.session.user.id),
        ),
      });

      if (!existingAlarm) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alarm not found or you don't have permission to delete it",
        });
      }

      await ctx.db.delete(Alarm).where(eq(Alarm.id, input.id));

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
