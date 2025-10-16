import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { Alarm, Device } from "@gently/db/schema";

import { protectedProcedure } from "../trpc";

export const deviceRouter = {
  // Get all devices for current user
  getAll: protectedProcedure.input(z.object({})).query(async ({ ctx }) => {
    const devices = await ctx.db
      .select()
      .from(Device)
      .where(eq(Device.userId, ctx.session.user.id));

    // Get alarm counts for each device
    if (devices.length === 0) {
      return devices.map((device) => ({
        ...device,
        _count: { alarms: 0 },
      }));
    }

    // Get alarm counts efficiently using subquery approach
    const devicesWithCounts = await Promise.all(
      devices.map(async (device) => {
        const alarmCount = await ctx.db
          .select({ count: count() })
          .from(Alarm)
          .where(eq(Alarm.deviceId, device.id));

        return {
          ...device,
          _count: {
            alarms: alarmCount[0]?.count ?? 0,
          },
        };
      }),
    );

    return devicesWithCounts;
  }),

  // Get device by ID (only if it belongs to the current user)
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const device = await ctx.db
        .select()
        .from(Device)
        .where(
          and(eq(Device.id, input.id), eq(Device.userId, ctx.session.user.id)),
        )
        .limit(1);

      if (!device.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found or you don't have permission to access it",
        });
      }

      // Get related alarms
      const alarms = await ctx.db
        .select()
        .from(Alarm)
        .where(eq(Alarm.deviceId, input.id));

      // Get alarm count
      const alarmCount = await ctx.db
        .select({ count: count() })
        .from(Alarm)
        .where(eq(Alarm.deviceId, input.id));

      return {
        ...device[0],
        alarms,
        _count: {
          alarms: alarmCount[0]?.count ?? 0,
        },
      };
    }),

  // Create device for current user
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string(),
        serialNumber: z.string().optional(),
        batteryLevel: z.number().int().min(0).max(100).optional(),
        // firmwareVersion is not stored in DB, only used for initial pairing info
        firmwareVersion: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.db
        .insert(Device)
        .values({
          title: input.title,
          description: input.description,
          serialNumber: input.serialNumber,
          batteryLevel: input.batteryLevel ?? 100,
          userId: ctx.session.user.id,
        })
        .returning();

      return result[0];
    }),

  // Update device (only if it belongs to the current user)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        serialNumber: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      // First check if the device belongs to the current user
      const existingDevice = await ctx.db
        .select()
        .from(Device)
        .where(and(eq(Device.id, id), eq(Device.userId, ctx.session.user.id)))
        .limit(1);

      if (!existingDevice.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found or you don't have permission to update it",
        });
      }

      console.log("Updating device with data:", data);

      const result = await ctx.db
        .update(Device)
        .set(data)
        .where(eq(Device.id, id))
        .returning();

      return result[0];
    }),

  // Update device info from Bluetooth connection
  updateFromBluetooth: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        serialNumber: z.string(),
        batteryLevel: z.number().min(0).max(100).optional(),
        firmwareVersion: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, serialNumber, batteryLevel, firmwareVersion } = input;

      // First check if the device belongs to the current user
      const existingDevice = await ctx.db
        .select()
        .from(Device)
        .where(and(eq(Device.id, id), eq(Device.userId, ctx.session.user.id)))
        .limit(1);

      if (!existingDevice.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found or you don't have permission to update it",
        });
      }

      // Check if we already have this serial number stored and it matches
      const currentDevice = existingDevice[0];
      if (
        currentDevice?.serialNumber &&
        currentDevice.serialNumber !== serialNumber
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Serial number mismatch. Expected: ${currentDevice.serialNumber}, Got: ${serialNumber}. This might be a different device.`,
        });
      }

      console.log("Updating device from Bluetooth connection:", {
        id,
        serialNumber,
        batteryLevel,
        firmwareVersion,
      });

      // Prepare update data
      const updateData: Partial<typeof Device.$inferInsert> = {
        serialNumber,
        lastSync: new Date(),
        syncStatus: "SYNCED" as const,
      };

      if (batteryLevel !== undefined) {
        updateData.batteryLevel = batteryLevel;
      }

      const result = await ctx.db
        .update(Device)
        .set(updateData)
        .where(eq(Device.id, id))
        .returning();

      return result[0];
    }),

  // Find device by serial number (for connection verification)
  findBySerialNumber: protectedProcedure
    .input(
      z.object({
        serialNumber: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const device = await ctx.db
        .select()
        .from(Device)
        .where(
          and(
            eq(Device.serialNumber, input.serialNumber),
            eq(Device.userId, ctx.session.user.id),
          ),
        )
        .limit(1);

      return device[0] ?? null;
    }),

  // Update sync status
  updateSyncStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        syncStatus: z.enum(["NOT_SYNCED", "SYNCING", "SYNCED", "ERROR"]),
        lastSync: z.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, syncStatus, lastSync } = input;

      // Verify device ownership
      const existingDevice = await ctx.db
        .select()
        .from(Device)
        .where(and(eq(Device.id, id), eq(Device.userId, ctx.session.user.id)))
        .limit(1);

      if (!existingDevice.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found or you don't have permission to update it",
        });
      }

      // Prepare update data
      const updateData: {
        syncStatus: "NOT_SYNCED" | "SYNCING" | "SYNCED" | "ERROR";
        lastSync?: Date;
      } = {
        syncStatus,
      };

      if (lastSync) {
        updateData.lastSync = lastSync;
      }

      const result = await ctx.db
        .update(Device)
        .set(updateData)
        .where(eq(Device.id, id))
        .returning();

      return result[0];
    }),

  // Delete device (only if it belongs to the current user)
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // First check if the device belongs to the current user
      const existingDevice = await ctx.db
        .select()
        .from(Device)
        .where(
          and(eq(Device.id, input.id), eq(Device.userId, ctx.session.user.id)),
        )
        .limit(1);

      if (!existingDevice.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found or you don't have permission to delete it",
        });
      }

      // Delete the device - alarms will be cascade deleted automatically by the database
      await ctx.db.delete(Device).where(eq(Device.id, input.id));

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
