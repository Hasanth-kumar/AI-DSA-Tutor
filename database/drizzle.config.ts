import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./schema/sqlite.schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.SQLITE_PATH ?? "./data/sqlite/dsa.db",
  },
});
