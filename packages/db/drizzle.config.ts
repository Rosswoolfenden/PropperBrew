import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  // Write migrations straight into Supabase's folder so `supabase db reset` applies them too.
  out: "../../supabase/migrations",
  dialect: "postgresql",
  casing: "snake_case",
  migrations: { prefix: "supabase" },
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
});
