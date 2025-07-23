import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

console.log("Connecting to database...");
console.log(process.env.POSTGRES_URL);
export const db = drizzle({
  connection: {
    url: process.env.POSTGRES_URL,
  },
  schema,
  casing: "snake_case",
});
