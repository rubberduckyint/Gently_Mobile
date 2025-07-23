import { pgCuid2 } from "drizzle-cuid2";
import { relations, sql } from "drizzle-orm";
import { pgEnum, pgTable } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { user } from "./auth-schema";

// Enums
export const syncStatusEnum = pgEnum("SyncStatus", [
  "NOT_SYNCED",
  "SYNCING",
  "SYNCED",
  "ERROR",
]);

export const alarmPriorityEnum = pgEnum("AlarmPriority", [
  "LOW",
  "MEDIUM",
  "HIGH",
]);

export const hapticChoiceEnum = pgEnum("HapticChoice", [
  "STANDARD",
  "STRONG",
  "SOFT",
  "DOUBLE",
  "PULSE",
  "WAVE",
]);

export const Device = pgTable("Device", (t) => ({
  id: pgCuid2("id").defaultRandom().primaryKey(),
  title: t.text().notNull(),
  description: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp()
    .$onUpdateFn(() => sql`now()`)
    .notNull(),
  syncStatus: syncStatusEnum().default("NOT_SYNCED").notNull(),
  batteryLevel: t.integer().default(100).notNull(),
  lastSync: t.timestamp(),
  userId: t
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}));

export const Alarm = pgTable("Alarm", (t) => ({
  id: pgCuid2("id").defaultRandom().primaryKey(),
  title: t.text().notNull(),
  description: t.text(),
  isActive: t.boolean().default(true).notNull(),
  startDate: t.timestamp().defaultNow().notNull(),
  endDate: t.timestamp(),
  repeat: t.boolean().default(false).notNull(),
  cronExpression: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp()
    .$onUpdateFn(() => sql`now()`)
    .notNull(),
  color: t.text().default("#000000").notNull(),
  syncStatus: syncStatusEnum().default("NOT_SYNCED").notNull(),
  priority: alarmPriorityEnum().default("MEDIUM").notNull(),
  hapticChoice: hapticChoiceEnum().default("STANDARD").notNull(),
  lastSync: t.timestamp(),
  userId: t
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  deviceId: t.text().references(() => Device.id),
}));

export const CreateDeviceSchema = createInsertSchema(Device, {
  title: z.string().min(1),
  description: z.string().min(1),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true, // This will be set from the session
});

export const UpdateDeviceSchema = createInsertSchema(Device, {
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
})
  .omit({
    createdAt: true,
    updatedAt: true,
    userId: true, // This will be set from the session
  })
  .extend({
    id: z.string(), // Required for updates
  });

export const DeviceWhereUniqueSchema = z.object({
  id: z.string(),
});

export const DeviceSelectSchema = createSelectSchema(Device);

export const DeviceWithAlarmsCountSchema = DeviceSelectSchema.extend({
  _count: z.object({
    alarms: z.number(),
  }),
});

// Inferred TypeScript types from Drizzle
export type Device = typeof Device.$inferSelect;
export type NewDevice = typeof Device.$inferInsert;

// Type for device with alarm count using proper Drizzle types
export type DeviceWithAlarmsCount = Device & {
  _count: {
    alarms: number;
  };
};

export type Alarm = typeof Alarm.$inferSelect;
export type NewAlarm = typeof Alarm.$inferInsert;

export const CreateAlarmSchema = createInsertSchema(Alarm, {
  title: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  repeat: z.boolean().optional(),
  cronExpression: z.string().min(1),
  color: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  hapticChoice: z
    .enum(["STANDARD", "STRONG", "SOFT", "DOUBLE", "PULSE", "WAVE"])
    .optional(),
  deviceId: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  syncStatus: true, // This will be handled automatically
  lastSync: true, // This will be handled automatically
  userId: true, // This will be set from the session
});

export const UpdateAlarmSchema = createInsertSchema(Alarm, {
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  repeat: z.boolean().optional(),
  cronExpression: z.string().min(1).optional(),
  color: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  hapticChoice: z
    .enum(["STANDARD", "STRONG", "SOFT", "DOUBLE", "PULSE", "WAVE"])
    .optional(),
  deviceId: z.string().optional(),
})
  .omit({
    createdAt: true,
    updatedAt: true,
    syncStatus: true, // This will be handled automatically
    lastSync: true, // This will be handled automatically
    userId: true, // This will be set from the session
  })
  .extend({
    id: z.string(), // Required for updates
  });

export const AlarmWhereUniqueSchema = z.object({
  id: z.string(),
});

export const AlarmSelectSchema = createSelectSchema(Alarm);

export const AlarmWithDeviceSchema = AlarmSelectSchema.extend({
  device: createSelectSchema(Device).nullable(),
});

export const AlarmListSchema = z.array(AlarmWithDeviceSchema);

// Relations
export const userRelations = relations(user, ({ many }) => ({
  devices: many(Device),
  alarms: many(Alarm),
}));

export const deviceRelations = relations(Device, ({ one, many }) => ({
  user: one(user, {
    fields: [Device.userId],
    references: [user.id],
  }),
  alarms: many(Alarm),
}));

export const alarmRelations = relations(Alarm, ({ one }) => ({
  user: one(user, {
    fields: [Alarm.userId],
    references: [user.id],
  }),
  device: one(Device, {
    fields: [Alarm.deviceId],
    references: [Device.id],
  }),
}));

export * from "./auth-schema";
