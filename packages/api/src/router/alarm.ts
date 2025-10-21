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
  UserPreferences,
} from "@gently/db/schema";

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

      // Get user preferences for default values
      const userPreferences = await ctx.db.query.UserPreferences.findFirst({
        where: eq(UserPreferences.userId, ctx.session.user.id),
      });

      // Merge input with user preferences (input takes precedence)
      const alarmData = {
        ...input,
        userId: ctx.session.user.id,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        // Apply user preferences as defaults if values not provided in input
        severityLevel: input.severityLevel ?? userPreferences?.defaultSeverityLevel,
        ledPattern: input.ledPattern ?? userPreferences?.defaultLedPattern,
        ledColor: input.ledColor ?? userPreferences?.defaultLedColor,
        vibrationPattern: input.vibrationPattern ?? userPreferences?.defaultVibrationPattern,
        vibrationIntensity: input.vibrationIntensity ?? userPreferences?.defaultVibrationIntensity,
        snoozePeriod: input.snoozePeriod ?? userPreferences?.defaultSnoozePeriod,
        snoozeTimeout: input.snoozeTimeout ?? userPreferences?.defaultSnoozeTimeout,
        retriggerDelay: input.retriggerDelay ?? userPreferences?.defaultRetriggerDelay,
        retriggerTimeout: input.retriggerTimeout ?? userPreferences?.defaultRetriggerTimeout,
      };

      const result = await ctx.db
        .insert(Alarm)
        .values(alarmData)
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
          // Reset sync status when alarm is updated so it will be synced to device
          syncStatus: "NOT_SYNCED",
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

  // Update sync status for alarms (batch update)
  updateSyncStatus: protectedProcedure
    .input(
      z.object({
        alarmIds: z.array(z.string()),
        syncStatus: z.enum(["NOT_SYNCED", "SYNCING", "SYNCED", "ERROR"]),
      }),
    )
    .output(z.object({ success: z.boolean(), updatedCount: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Verify all alarms belong to the current user
      const alarms = await ctx.db.query.Alarm.findMany({
        where: eq(Alarm.userId, ctx.session.user.id),
      });

      const userAlarmIds = new Set(alarms.map((a) => a.id));
      const validAlarmIds = input.alarmIds.filter((id) => userAlarmIds.has(id));

      if (validAlarmIds.length === 0) {
        return { success: true, updatedCount: 0 };
      }

      // Update sync status for all valid alarms
      let updatedCount = 0;
      for (const alarmId of validAlarmIds) {
        await ctx.db
          .update(Alarm)
          .set({
            syncStatus: input.syncStatus,
            lastSync: input.syncStatus === "SYNCED" ? new Date() : undefined,
          })
          .where(eq(Alarm.id, alarmId));
        updatedCount++;
      }

      return { success: true, updatedCount };
    }),

  // Get unsynced alarms for a device
  getUnsyncedByDevice: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .output(AlarmListSchema)
    .query(async ({ input, ctx }) => {
      return await ctx.db.query.Alarm.findMany({
        where: and(
          eq(Alarm.userId, ctx.session.user.id),
          eq(Alarm.deviceId, input.deviceId),
        ),
        with: {
          device: true,
        },
      });
    }),

  // Update device index for an alarm (for incremental sync)
  updateDeviceIndex: protectedProcedure
    .input(
      z.object({
        alarmId: z.string(),
        deviceIndex: z.number().int().min(0).max(49).nullable(),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Check if alarm exists and belongs to current user
      const existingAlarm = await ctx.db.query.Alarm.findFirst({
        where: and(
          eq(Alarm.id, input.alarmId),
          eq(Alarm.userId, ctx.session.user.id),
        ),
      });

      if (!existingAlarm) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Alarm not found or you don't have permission to update it",
        });
      }

      await ctx.db
        .update(Alarm)
        .set({ deviceIndex: input.deviceIndex })
        .where(eq(Alarm.id, input.alarmId));

      return { success: true };
    }),

  // Batch update device indices (for incremental sync)
  batchUpdateDeviceIndices: protectedProcedure
    .input(
      z.object({
        updates: z.array(
          z.object({
            alarmId: z.string(),
            deviceIndex: z.number().int().min(0).max(49).nullable(),
          }),
        ),
      }),
    )
    .output(z.object({ success: z.boolean(), updatedCount: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Verify all alarms belong to the current user
      const alarms = await ctx.db.query.Alarm.findMany({
        where: eq(Alarm.userId, ctx.session.user.id),
      });

      const userAlarmIds = new Set(alarms.map((a) => a.id));
      const validUpdates = input.updates.filter((u) =>
        userAlarmIds.has(u.alarmId),
      );

      if (validUpdates.length === 0) {
        return { success: true, updatedCount: 0 };
      }

      // Update device indices for all valid alarms
      let updatedCount = 0;
      for (const update of validUpdates) {
        await ctx.db
          .update(Alarm)
          .set({ deviceIndex: update.deviceIndex })
          .where(eq(Alarm.id, update.alarmId));
        updatedCount++;
      }

      return { success: true, updatedCount };
    }),
} satisfies TRPCRouterRecord;
