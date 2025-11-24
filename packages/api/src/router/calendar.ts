/**
 * Calendar Integration Router
 * Handles Google Calendar OAuth and event synchronization
 */

import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import {
  CalendarConnection,
  CreateCalendarConnectionSchema,
} from "@gently/db/schema";

import { protectedProcedure, router } from "../trpc";

export const calendarRouter = router({
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
});
