/**
 * Calendar Integration Router
 * Handles Google Calendar OAuth and event synchronization
 */

import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import {
  Alarm,
  CalendarConnection,
  CalendarEventAlarm,
  CreateCalendarConnectionSchema,
  UserPreferences,
} from "@gently/db/schema";

import { protectedProcedure, createTRPCRouter } from "../trpc";

export const calendarRouter = createTRPCRouter({
  // Get all calendar connections for the authenticated user
  getConnections: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db
      .select()
      .from(CalendarConnection)
      .where(eq(CalendarConnection.userId, ctx.session.user.id))
      .orderBy(desc(CalendarConnection.createdAt));
  }),

  // Get a specific calendar connection
  getConnection: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const connection = await ctx.db.query.CalendarConnection.findFirst({
        where: and(
          eq(CalendarConnection.id, input.id),
          eq(CalendarConnection.userId, ctx.session.user.id),
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar connection not found",
        });
      }

      return connection;
    }),

  // Create a new calendar connection (called after OAuth)
  createConnection: protectedProcedure
    .input(CreateCalendarConnectionSchema)
    .mutation(async ({ ctx, input }) => {
      const [connection] = await ctx.db
        .insert(CalendarConnection)
        .values({
          ...input,
          userId: ctx.session.user.id,
        })
        .returning();

      return connection;
    }),

  // Update calendar connection tokens
  updateTokens: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        accessToken: z.string(),
        refreshToken: z.string().optional(),
        tokenExpiresAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const [updated] = await ctx.db
        .update(CalendarConnection)
        .set(updates)
        .where(
          and(
            eq(CalendarConnection.id, id),
            eq(CalendarConnection.userId, ctx.session.user.id),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar connection not found",
        });
      }

      return updated;
    }),

  // Toggle connection active status
  toggleActive: protectedProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(CalendarConnection)
        .set({ isActive: input.isActive })
        .where(
          and(
            eq(CalendarConnection.id, input.id),
            eq(CalendarConnection.userId, ctx.session.user.id),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar connection not found",
        });
      }

      return updated;
    }),

  // Delete a calendar connection
  deleteConnection: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(CalendarConnection)
        .where(
          and(
            eq(CalendarConnection.id, input.id),
            eq(CalendarConnection.userId, ctx.session.user.id),
          ),
        )
        .returning();

      if (!result.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar connection not found",
        });
      }

      return { success: true };
    }),

  // Update last synced timestamp
  updateLastSynced: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(CalendarConnection)
        .set({ lastSyncedAt: new Date() })
        .where(
          and(
            eq(CalendarConnection.id, input.id),
            eq(CalendarConnection.userId, ctx.session.user.id),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar connection not found",
        });
      }

      return updated;
    }),

  // Create alarms from calendar events
  createAlarmsFromEvents: protectedProcedure
    .input(
      z.object({
        connectionId: z.string(),
        events: z.array(
          z.object({
            eventId: z.string(),
            eventSummary: z.string(),
            eventStartTime: z.date(),
            eventEndTime: z.date().optional(),
            eventLocation: z.string().optional(),
            alarmMinutesBefore: z.number().int().min(0).max(1440),
          }),
        ),
        deviceId: z.string().optional(), // Optional device to sync to
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify connection exists and belongs to user
      const connection = await ctx.db.query.CalendarConnection.findFirst({
        where: and(
          eq(CalendarConnection.id, input.connectionId),
          eq(CalendarConnection.userId, ctx.session.user.id),
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar connection not found",
        });
      }

      // Get user's default alarm preferences
      const preferences = await ctx.db.query.UserPreferences.findFirst({
        where: eq(UserPreferences.userId, ctx.session.user.id),
      });

      const createdAlarms: {
        alarm: typeof Alarm.$inferSelect;
        eventMapping: typeof CalendarEventAlarm.$inferSelect;
      }[] = [];

      // Generate unique 10-character alphanumeric peripheral ID
      const generatePeripheralId = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < 10; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };

      // Create alarms for each event
      for (const event of input.events) {
        // Calculate alarm time (event start time minus minutes before)
        const alarmTime = new Date(event.eventStartTime);
        alarmTime.setMinutes(alarmTime.getMinutes() - event.alarmMinutesBefore);

        // Generate cron expression for the specific date/time
        const cronExpression = `${alarmTime.getMinutes()} ${alarmTime.getHours()} ${alarmTime.getDate()} ${alarmTime.getMonth() + 1} *`;

        // Ensure ledPattern is a valid BLE pattern (not "OFF")
        // If user has "OFF" as default, use "BLINK_SLOW" instead since OFF doesn't make sense for alarms
        const effectiveLedPattern = 
          preferences?.defaultLedPattern === "OFF" 
            ? "BLINK_SLOW" 
            : (preferences?.defaultLedPattern ?? "BLINK_SLOW");

        // Create the alarm
        const [alarm] = await ctx.db
          .insert(Alarm)
          .values({
            title: event.eventSummary,
            description: `Reminder for calendar event${event.eventLocation ? ` at ${event.eventLocation}` : ""}`,
            cronExpression,
            startDate: alarmTime,
            endDate: event.eventEndTime ?? undefined,
            isActive: true,
            repeat: false, // Calendar events are one-time by default
            userId: ctx.session.user.id,
            deviceId: input.deviceId,
            peripheralId: generatePeripheralId(), // Required for BLE sync event name
            // Use user's default preferences
            severityLevel: preferences?.defaultSeverityLevel ?? "INFORMATIONAL",
            ledPattern: effectiveLedPattern,
            ledColor: preferences?.defaultLedColor ?? "BLUE",
            vibrationPattern: preferences?.defaultVibrationPattern ?? 1,
            vibrationIntensity:
              preferences?.defaultVibrationIntensity ?? "MEDIUM",
            snoozePeriod: preferences?.defaultSnoozePeriod ?? 5,
            snoozeTimeout: preferences?.defaultSnoozeTimeout ?? 15,
            retriggerDelay: preferences?.defaultRetriggerDelay ?? 1,
            retriggerTimeout: preferences?.defaultRetriggerTimeout ?? 5,
            syncStatus: "NOT_SYNCED",
          })
          .returning();

        if (!alarm) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create alarm for event ${event.eventSummary}`,
          });
        }

        // Create the event-alarm mapping
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const eventMappingResult = await ctx.db
          .insert(CalendarEventAlarm)
          .values({
            userId: ctx.session.user.id,
            calendarConnectionId: input.connectionId,
            alarmId: alarm.id,
            eventId: event.eventId,
            eventSummary: event.eventSummary,
            eventStartTime: event.eventStartTime,
            eventEndTime: event.eventEndTime ?? undefined,
            eventLocation: event.eventLocation ?? undefined,
            alarmMinutesBefore: event.alarmMinutesBefore,
          })
          .returning();

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const eventMapping = eventMappingResult[0];
        if (!eventMapping) {
          // Rollback: delete the alarm if mapping creation failed
          await ctx.db.delete(Alarm).where(eq(Alarm.id, alarm.id));
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create event mapping for ${event.eventSummary}`,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        createdAlarms.push({ alarm, eventMapping });
      }

      // Update last synced timestamp
      await ctx.db
        .update(CalendarConnection)
        .set({ lastSyncedAt: new Date() })
        .where(eq(CalendarConnection.id, input.connectionId));

      return {
        success: true,
        created: createdAlarms.length,
        alarms: createdAlarms,
      };
    }),

  // Get all calendar event IDs that are linked to alarms for a connection
  getLinkedEventIds: protectedProcedure
    .input(z.object({ connectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const linkedEvents = await ctx.db
        .select({ eventId: CalendarEventAlarm.eventId })
        .from(CalendarEventAlarm)
        .where(
          and(
            eq(CalendarEventAlarm.calendarConnectionId, input.connectionId),
            eq(CalendarEventAlarm.userId, ctx.session.user.id),
          ),
        );

      return linkedEvents.map((e) => e.eventId);
    }),
});
