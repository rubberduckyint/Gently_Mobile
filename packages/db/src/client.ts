import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

export const db = drizzle({
  connection: {
    url: process.env.POSTGRES_URL,
  },
  schema,
  casing: "snake_case",
});

export type DbClient = typeof db;