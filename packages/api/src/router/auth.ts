import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { user } from "@acme/db";
import { db } from "@acme/db/client";

import { protectedProcedure, publicProcedure } from "../trpc";

export const authRouter = {
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),
  getSecretMessage: protectedProcedure.query(() => {
    return "you can see this secret message!";
  }),
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const userProfile = await db.query.user.findFirst({
      where: eq(user.id, ctx.session.user.id),
    });

    if (!userProfile) {
      throw new Error("User not found");
    }

    return userProfile;
  }),
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        isAdmin: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Only allow isAdmin updates if the current user is already an admin
      if (input.isAdmin !== undefined) {
        const currentUser = await db.query.user.findFirst({
          where: eq(user.id, ctx.session.user.id),
        });

        if (!currentUser?.isAdmin) {
          throw new Error("Only administrators can modify admin status");
        }
      }

      const updatedUser = await db
        .update(user)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.session.user.id))
        .returning();

      if (!updatedUser.length) {
        throw new Error("Failed to update user");
      }

      return updatedUser[0];
    }),
  promoteToAdmin: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        isAdmin: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Only allow admin users to promote/demote other users
      const currentUser = await db.query.user.findFirst({
        where: eq(user.id, ctx.session.user.id),
      });

      if (!currentUser?.isAdmin) {
        throw new Error("Only administrators can modify user admin status");
      }

      const updatedUser = await db
        .update(user)
        .set({
          isAdmin: input.isAdmin,
          updatedAt: new Date(),
        })
        .where(eq(user.id, input.userId))
        .returning();

      if (!updatedUser.length) {
        throw new Error("Failed to update user admin status");
      }

      return updatedUser[0];
    }),
} satisfies TRPCRouterRecord;
