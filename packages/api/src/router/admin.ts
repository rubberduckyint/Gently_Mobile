import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { count, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@gently/db/client";
import {
  Alarm,
  AlarmSelectSchema,
  Device,
  DeviceSelectSchema,
  user,
} from "@gently/db/schema";

import { adminProcedure } from "../trpc";

// Admin-specific input schemas that aren't in the main schema
const AdminUserCreateInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  isAdmin: z.boolean().optional(),
});

const AdminUserUpdateInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  isAdmin: z.boolean().optional(),
});

// List schemas for admin endpoints
const AdminUserListSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      emailVerified: z.boolean(),
      image: z.string().nullable(),
      isAdmin: z.boolean(),
      createdAt: z.date(),
      updatedAt: z.date(),
      _count: z.object({
        devices: z.number(),
        alarms: z.number(),
      }),
    }),
  ),
  pagination: z.object({
    total: z.number(),
    pages: z.number(),
    currentPage: z.number(),
    limit: z.number(),
  }),
});

const AdminDeviceListSchema = z.object({
  devices: z.array(
    DeviceSelectSchema.extend({
      user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
      _count: z.object({
        alarms: z.number(),
      }),
    }),
  ),
  pagination: z.object({
    total: z.number(),
    pages: z.number(),
    currentPage: z.number(),
    limit: z.number(),
  }),
});

const AdminAlarmListSchema = z.object({
  alarms: z.array(
    AlarmSelectSchema.extend({
      user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
      device: z
        .object({
          id: z.string(),
          title: z.string(),
        })
        .nullable(),
    }),
  ),
  pagination: z.object({
    total: z.number(),
    pages: z.number(),
    currentPage: z.number(),
    limit: z.number(),
  }),
});

export const adminRouter = {
  // Get all users (admin only, with pagination and search)
  getAllUsers: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).optional(),
        limit: z.number().min(1).max(100).optional(),
        search: z.string().optional(),
      }),
    )
    .output(AdminUserListSchema)
    .query(async ({ ctx, input }) => {
      const { page = 1, limit = 10, search } = input;
      const offset = (page - 1) * limit;

      // Build where condition for search
      const whereCondition = search
        ? or(like(user.name, `%${search}%`), like(user.email, `%${search}%`))
        : undefined;

      // Get users with device and alarm counts
      const users = await ctx.db.query.user.findMany({
        where: whereCondition,
        limit,
        offset,
        orderBy: desc(user.createdAt),
        with: {
          devices: {
            columns: { id: true },
          },
          alarms: {
            columns: { id: true },
          },
        },
      });

      // Transform to include counts
      const usersWithCounts = users.map((u) => ({
        ...u,
        _count: {
          devices: u.devices.length,
          alarms: u.alarms.length,
        },
      }));

      // Get total count for pagination
      const totalResult = await ctx.db
        .select({ count: count() })
        .from(user)
        .where(whereCondition);

      const total = totalResult[0]?.count ?? 0;

      return {
        users: usersWithCounts,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          currentPage: page,
          limit,
        },
      };
    }),

  // Get user by ID (admin only, with full details)
  getUserById: adminProcedure
    .input(z.object({ id: z.string() }))
    .output(
      z
        .object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
          emailVerified: z.date().nullable(),
          image: z.string().nullable(),
          isAdmin: z.boolean(),
          createdAt: z.date(),
          updatedAt: z.date(),
          devices: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              description: z.string(),
              userId: z.string(),
              syncStatus: z.enum(["NOT_SYNCED", "SYNCING", "SYNCED", "ERROR"]),
              batteryLevel: z.number(),
              lastSync: z.date().nullable(),
              createdAt: z.date(),
              updatedAt: z.date(),
              _count: z.object({
                alarms: z.number(),
              }),
            }),
          ),
          alarms: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              description: z.string().nullable(),
              isActive: z.boolean(),
              startDate: z.date(),
              endDate: z.date().nullable(),
              repeat: z.boolean(),
              cronExpression: z.string(),
              syncStatus: z.enum(["NOT_SYNCED", "SYNCING", "SYNCED", "ERROR"]),
              // BLE Protocol fields (consolidated - replaced legacy color, priority, hapticChoice)
              severityLevel: z.enum(["INFORMATIONAL", "WARNING", "CRITICAL"]),
              ledPattern: z.enum([
                "OFF",
                "SOLID",
                "BLINK_SLOW",
                "BLINK_FAST",
                "PULSE",
                "STROBE",
              ]),
              ledColor: z.enum([
                "RED",
                "GREEN",
                "BLUE",
                "YELLOW",
                "MAGENTA",
                "CYAN",
                "WHITE",
              ]),
              vibrationPattern: z.number(),
              vibrationIntensity: z.enum(["LOW", "MEDIUM", "HIGH", "MAXIMUM"]),
              snoozePeriod: z.number(),
              snoozeTimeout: z.number(),
              retriggerDelay: z.number(),
              retriggerTimeout: z.number(),
              lastSync: z.date().nullable(),
              userId: z.string(),
              deviceId: z.string().nullable(),
              createdAt: z.date(),
              updatedAt: z.date(),
              device: z
                .object({
                  title: z.string(),
                })
                .nullable(),
            }),
          ),
          _count: z.object({
            devices: z.number(),
            alarms: z.number(),
          }),
        })
        .nullable(),
    )
    .query(async ({ input }) => {
      // Get user with all related data
      const userData = await db.query.user.findFirst({
        where: eq(user.id, input.id),
        with: {
          devices: {
            with: {
              alarms: {
                columns: { id: true },
              },
            },
          },
          alarms: {
            with: {
              device: {
                columns: {
                  title: true,
                },
              },
            },
          },
        },
      });

      if (!userData) {
        return null;
      }

      // Transform the data to match the expected output schema
      const transformedUser = {
        ...userData,
        emailVerified: userData.emailVerified ? new Date() : null, // Convert boolean to Date | null
        updatedAt: new Date(userData.updatedAt), // Convert string to Date
        devices: userData.devices.map((device) => ({
          ...device,
          updatedAt: new Date(device.updatedAt), // Convert string to Date
          _count: {
            alarms: device.alarms.length,
          },
        })),
        alarms: userData.alarms.map((alarm) => ({
          ...alarm,
          updatedAt: new Date(alarm.updatedAt), // Convert string to Date
          device: alarm.device,
        })),
        _count: {
          devices: userData.devices.length,
          alarms: userData.alarms.length,
        },
      };

      return transformedUser;
    }),

  // Create user (admin only)
  createUser: adminProcedure
    .input(AdminUserCreateInputSchema)
    .output(
      z.object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string(),
        isAdmin: z.boolean(),
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await db
        .insert(user)
        .values({
          id: crypto.randomUUID(),
          name: input.name,
          email: input.email,
          emailVerified: false,
          isAdmin: input.isAdmin ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
          // Note: password handling would need proper hashing in a real app
        })
        .returning({
          id: user.id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        });

      if (!result[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return result[0];
    }),

  // Update user (admin only)
  updateUser: adminProcedure
    .input(AdminUserUpdateInputSchema)
    .output(
      z.object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string(),
        isAdmin: z.boolean(),
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;

      const result = await db
        .update(user)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(user.id, id))
        .returning({
          id: user.id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        });

      if (!result[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return result[0];
    }),

  // Delete user (admin only)
  deleteUser: adminProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input }) => {
      const result = await db
        .delete(user)
        .where(eq(user.id, input.id))
        .returning({ id: user.id });

      if (!result[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true };
    }),

  // Get all devices (admin only)
  getAllDevices: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).optional(),
        limit: z.number().min(1).max(100).optional(),
        search: z.string().optional(),
      }),
    )
    .output(AdminDeviceListSchema)
    .query(async ({ input }) => {
      const { page = 1, limit = 10, search } = input;
      const skip = (page - 1) * limit;

      // Build where condition
      let whereCondition;
      if (search) {
        whereCondition = or(
          like(Device.title, `%${search}%`),
          like(Device.description, `%${search}%`),
        );
      }

      const [devices, totalResult] = await Promise.all([
        db.query.Device.findMany({
          where: whereCondition,
          limit,
          offset: skip,
          orderBy: desc(Device.createdAt),
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
            alarms: {
              columns: { id: true },
            },
          },
        }),
        db.select({ count: count() }).from(Device).where(whereCondition),
      ]);

      const total = totalResult[0]?.count ?? 0;

      return {
        devices: devices.map((device) => ({
          ...device,
          _count: {
            alarms: device.alarms.length,
          },
        })),
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          currentPage: page,
          limit,
        },
      };
    }),

  // Get all alarms (admin only)
  getAllAlarms: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).optional(),
        limit: z.number().min(1).max(100).optional(),
        search: z.string().optional(),
      }),
    )
    .output(AdminAlarmListSchema)
    .query(async ({ input }) => {
      const { page = 1, limit = 10, search } = input;
      const offset = (page - 1) * limit;

      // Build where condition for search
      const whereCondition = search
        ? or(
            like(Alarm.title, `%${search}%`),
            like(Alarm.description, `%${search}%`),
          )
        : undefined;

      // Get alarms with user and device information
      const alarms = await db.query.Alarm.findMany({
        where: whereCondition,
        limit,
        offset,
        orderBy: desc(Alarm.createdAt),
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
          device: {
            columns: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Get total count for pagination
      const totalResult = await db
        .select({ count: count() })
        .from(Alarm)
        .where(whereCondition);

      const total = totalResult[0]?.count ?? 0;

      return {
        alarms,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          currentPage: page,
          limit,
        },
      };
    }),
} satisfies TRPCRouterRecord;
