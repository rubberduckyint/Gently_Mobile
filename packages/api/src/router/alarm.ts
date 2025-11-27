import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import type { DbClient } from "@gently/db";
import {
  Alarm,
  AlarmListSchema,
  AlarmSelectSchema,
  AlarmWhereUniqueSchema,
  CreateAlarmSchema,
  Device,
  DeviceShare,
  UpdateAlarmSchema,
  user,
  UserPreferences,
} from "@gently/db/schema";

import { protectedProcedure } from "../trpc";
import { sendPushNotificationToUser } from "./notification";

// Helper function to check if a user can modify alarms for a device
// Returns { canEdit: boolean, isOwner: boolean, deviceOwnerId?: string }
async function checkDeviceEditPermission(
  db: DbClient,
  deviceId: string,
  userId: string,
): Promise<{ canEdit: boolean; isOwner: boolean; deviceOwnerId?: string }> {
  // Check if user owns the device
  const device = await db.query.Device.findFirst({
    where: and(eq(Device.id, deviceId), eq(Device.userId, userId)),
  });

  if (device) {
    return { canEdit: true, isOwner: true, deviceOwnerId: userId };
  }

  // Check if user has WRITE permission via DeviceShare
  const share = await db.query.DeviceShare.findFirst({
    where: and(
      eq(DeviceShare.deviceId, deviceId),
      eq(DeviceShare.sharedWithUserId, userId),
      eq(DeviceShare.status, "ACCEPTED"),
      eq(DeviceShare.permission, "WRITE"),
    ),
    with: {
      device: true,
    },
  });

  if (share) {
    return { canEdit: true, isOwner: false, deviceOwnerId: share.device.userId };
  }

  return { canEdit: false, isOwner: false };
}

// Helper function to notify device owner about alarm changes by shared user
async function notifyDeviceOwnerOfChange(
  db: DbClient,
  deviceOwnerId: string,
  sharedUserId: string,
  deviceId: string,
  alarmTitle: string,
  action: "created" | "updated" | "deleted",
): Promise<void> {
  try {
    // Get the shared user's info for the notification
    const sharedUser = await db.query.user.findFirst({
      where: eq(user.id, sharedUserId),
    });

    const device = await db.query.Device.findFirst({
      where: eq(Device.id, deviceId),
    });

    const sharedUserName = sharedUser?.name ?? sharedUser?.email ?? "A shared user";
    const deviceName = device?.title ?? "your device";

    // Build the notification message
    const actionVerb = action === "created" ? "added" : action === "updated" ? "modified" : "removed";
    const title = `Alarm ${actionVerb} on ${deviceName}`;
    const body = `${sharedUserName} ${actionVerb} the alarm "${alarmTitle}"`;

    // Send push notification to device owner
    const result = await sendPushNotificationToUser(db, deviceOwnerId, {
      title,
      body,
      data: {
        type: "shared_alarm_change",
        action,
        deviceId,
        alarmTitle,
        sharedUserId,
        sharedUserName,
      },
    });

    console.log(`[NOTIFICATION] Device owner ${deviceOwnerId}: ${body}`, result);
  } catch (error) {
    // Don't fail the alarm operation if notification fails
    console.error("Failed to notify device owner:", error);
  }
}

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
          calendarEventAlarm: {
            with: {
              calendarConnection: true,
            },
          },
        },
      });
    }),

  // Get alarm by ID (only if it belongs to the current user)
  getById: protectedProcedure
    .input(AlarmWhereUniqueSchema)
    .query(async ({ input, ctx }) => {
      const alarm = await ctx.db.query.Alarm.findFirst({
        where: and(
          eq(Alarm.id, input.id),
          eq(Alarm.userId, ctx.session.user.id),
        ),
        with: {
          calendarEventAlarm: {
            with: {
              calendarConnection: true,
            },
          },
        },
      });

      if (!alarm) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alarm not found or you don't have permission to access it",
        });
      }

      return alarm;
    }),

  // Create alarm for current user (or shared device with WRITE permission)
  create: protectedProcedure
    .input(CreateAlarmSchema)
    .output(AlarmSelectSchema)
    .mutation(async ({ input, ctx }) => {
      let isSharedUserEdit = false;
      let deviceOwnerId: string | undefined;

      // If deviceId is provided, verify permission
      if (input.deviceId) {
        const permission = await checkDeviceEditPermission(
          ctx.db,
          input.deviceId,
          ctx.session.user.id,
        );

        if (!permission.canEdit) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Device not found or you don't have permission to use it",
          });
        }

        isSharedUserEdit = !permission.isOwner;
        deviceOwnerId = permission.deviceOwnerId;
      }

      // Generate unique 10-character alphanumeric peripheral ID
      const generatePeripheralId = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < 10; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };

      // Get user preferences for default values
      const userPreferences = await ctx.db.query.UserPreferences.findFirst({
        where: eq(UserPreferences.userId, ctx.session.user.id),
      });

      // Merge input with user preferences (input takes precedence)
      const alarmData = {
        ...input,
        userId: ctx.session.user.id,
        peripheralId: generatePeripheralId(),
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        // Apply user preferences as defaults if values not provided in input
        severityLevel:
          input.severityLevel ?? userPreferences?.defaultSeverityLevel,
        ledPattern: input.ledPattern ?? userPreferences?.defaultLedPattern,
        ledColor: input.ledColor ?? userPreferences?.defaultLedColor,
        vibrationPattern:
          input.vibrationPattern ?? userPreferences?.defaultVibrationPattern,
        vibrationIntensity:
          input.vibrationIntensity ??
          userPreferences?.defaultVibrationIntensity,
        snoozePeriod:
          input.snoozePeriod ?? userPreferences?.defaultSnoozePeriod,
        snoozeTimeout:
          input.snoozeTimeout ?? userPreferences?.defaultSnoozeTimeout,
        retriggerDelay:
          input.retriggerDelay ?? userPreferences?.defaultRetriggerDelay,
        retriggerTimeout:
          input.retriggerTimeout ?? userPreferences?.defaultRetriggerTimeout,
        pushNotification:
          input.pushNotification ??
          userPreferences?.defaultPushNotification ??
          true,
        emailNotification:
          input.emailNotification ??
          userPreferences?.defaultEmailNotification ??
          false,
      };

      const result = await ctx.db.insert(Alarm).values(alarmData).returning();

      if (!result[0]) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create alarm",
        });
      }

      // Notify device owner if a shared user created the alarm
      if (isSharedUserEdit && deviceOwnerId && input.deviceId) {
        await notifyDeviceOwnerOfChange(
          ctx.db,
          deviceOwnerId,
          ctx.session.user.id,
          input.deviceId,
          result[0].title,
          "created",
        );
      }

      return result[0];
    }),

  // Update alarm (by owner or shared user with WRITE permission)
  update: protectedProcedure
    .input(UpdateAlarmSchema)
    .output(AlarmSelectSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      // First, get the alarm to check if it exists
      const existingAlarm = await ctx.db.query.Alarm.findFirst({
        where: eq(Alarm.id, id),
      });

      if (!existingAlarm) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alarm not found",
        });
      }

      // Check if user can edit this alarm (owner or shared user with WRITE permission)
      let isSharedUserEdit = false;
      let deviceOwnerId: string | undefined;

      if (existingAlarm.userId === ctx.session.user.id) {
        // User owns the alarm
        isSharedUserEdit = false;
      } else if (existingAlarm.deviceId) {
        // Check if user has WRITE permission on the device
        const permission = await checkDeviceEditPermission(
          ctx.db,
          existingAlarm.deviceId,
          ctx.session.user.id,
        );

        if (!permission.canEdit) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Alarm not found or you don't have permission to edit it",
          });
        }

        isSharedUserEdit = !permission.isOwner;
        deviceOwnerId = permission.deviceOwnerId;
      } else {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alarm not found or you don't have permission to edit it",
        });
      }

      // If deviceId is being updated, verify permission for the new device
      if (data.deviceId && data.deviceId !== existingAlarm.deviceId) {
        const newDevicePermission = await checkDeviceEditPermission(
          ctx.db,
          data.deviceId,
          ctx.session.user.id,
        );

        if (!newDevicePermission.canEdit) {
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

      const updatedAlarm = result[0] ?? existingAlarm;

      // Notify device owner if a shared user updated the alarm
      if (isSharedUserEdit && deviceOwnerId && existingAlarm.deviceId) {
        await notifyDeviceOwnerOfChange(
          ctx.db,
          deviceOwnerId,
          ctx.session.user.id,
          existingAlarm.deviceId,
          updatedAlarm.title,
          "updated",
        );
      }

      return updatedAlarm;
    }),

  // Delete alarm (by owner or shared user with WRITE permission)
  delete: protectedProcedure
    .input(AlarmWhereUniqueSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // First get the alarm to check if it exists
      const existingAlarm = await ctx.db.query.Alarm.findFirst({
        where: eq(Alarm.id, input.id),
      });

      if (!existingAlarm) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alarm not found or you don't have permission to delete it",
        });
      }

      // Check if user can delete this alarm (owner or shared user with WRITE permission)
      let isSharedUserEdit = false;
      let deviceOwnerId: string | undefined;

      if (existingAlarm.userId === ctx.session.user.id) {
        // User owns the alarm
        isSharedUserEdit = false;
      } else if (existingAlarm.deviceId) {
        // Check if user has WRITE permission on the device
        const permission = await checkDeviceEditPermission(
          ctx.db,
          existingAlarm.deviceId,
          ctx.session.user.id,
        );

        if (!permission.canEdit) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Alarm not found or you don't have permission to delete it",
          });
        }

        isSharedUserEdit = !permission.isOwner;
        deviceOwnerId = permission.deviceOwnerId;
      } else {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alarm not found or you don't have permission to delete it",
        });
      }

      const alarmTitle = existingAlarm.title;
      const alarmDeviceId = existingAlarm.deviceId;

      await ctx.db.delete(Alarm).where(eq(Alarm.id, input.id));

      // Notify device owner if a shared user deleted the alarm
      if (isSharedUserEdit && deviceOwnerId && alarmDeviceId) {
        await notifyDeviceOwnerOfChange(
          ctx.db,
          deviceOwnerId,
          ctx.session.user.id,
          alarmDeviceId,
          alarmTitle,
          "deleted",
        );
      }

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
          message: "Alarm not found or you don't have permission to update it",
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
