import { adminRouter } from "./router/admin";
import { alarmRouter } from "./router/alarm";
import { authRouter } from "./router/auth";
import { calendarRouter } from "./router/calendar";
import { deviceRouter } from "./router/device";
import { userPreferencesRouter } from "./router/userPreferences";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  admin: adminRouter,
  alarm: alarmRouter,
  device: deviceRouter,
  userPreferences: userPreferencesRouter,
  calendar: calendarRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
