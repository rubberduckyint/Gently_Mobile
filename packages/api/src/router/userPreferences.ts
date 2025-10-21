import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import {
  UpdateUserPreferencesSchema,
  UserPreferences,
  UserPreferencesSelectSchema,
} from "@gently/db/schema";

import { protectedProcedure } from "../trpc";

export const userPreferencesRouter = {
  // Get current user's preferences (create with defaults if doesn't exist)
  get: protectedProcedure
    .input(z.object({}))
    .output(UserPreferencesSelectSchema)
    .query(async ({ ctx }) => {
      let preferences = await ctx.db.query.UserPreferences.findFirst({
        where: eq(UserPreferences.userId, ctx.session.user.id),
      });

      // If preferences don't exist, create them with defaults
      if (!preferences) {
        const result = await ctx.db
          .insert(UserPreferences)
          .values({
            userId: ctx.session.user.id,
          })
          .returning();

        preferences = result[0];

        if (!preferences) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create user preferences",
          });
        }
      }

      return preferences;
    }),

  // Update current user's preferences
  update: protectedProcedure
    .input(UpdateUserPreferencesSchema)
    .output(UserPreferencesSelectSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if preferences exist
      const existingPreferences = await ctx.db.query.UserPreferences.findFirst({
        where: eq(UserPreferences.userId, ctx.session.user.id),
      });

      if (!existingPreferences) {
        // Create new preferences with the provided values
        const result = await ctx.db
          .insert(UserPreferences)
          .values({
            userId: ctx.session.user.id,
            ...input,
          })
          .returning();

        const newPreferences = result[0];
        if (!newPreferences) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create user preferences",
          });
        }

        return newPreferences;
      }

      // Update existing preferences
      const result = await ctx.db
        .update(UserPreferences)
        .set(input)
        .where(eq(UserPreferences.userId, ctx.session.user.id))
        .returning();

      const updatedPreferences = result[0];
      if (!updatedPreferences) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update user preferences",
        });
      }

      return updatedPreferences;
    }),

  // Reset preferences to defaults
  reset: protectedProcedure
    .input(z.object({}))
    .output(UserPreferencesSelectSchema)
    .mutation(async ({ ctx }) => {
      // Delete existing preferences
      await ctx.db
        .delete(UserPreferences)
        .where(eq(UserPreferences.userId, ctx.session.user.id));

      // Create new preferences with defaults
      const result = await ctx.db
        .insert(UserPreferences)
        .values({
          userId: ctx.session.user.id,
        })
        .returning();

      const newPreferences = result[0];
      if (!newPreferences) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to reset user preferences",
        });
      }

      return newPreferences;
    }),
} satisfies TRPCRouterRecord;
