import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

if (process.env.NODE_ENV === "development") {
  config({ path: ".env.local" });
}

export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./src/lib/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
});
