import { execSync } from "node:child_process";
import { E2E } from "../playwright.config";

// Empties every app table (keeps the migrations table), so each run starts from the seed.
const TRUNCATE_ALL = `DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
    EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE';
  END LOOP;
END $$;`;

/**
 * Brings the dedicated e2e database to the latest migrations, empties it and seeds it
 * (Linux Days 1–7, the Module 1 test and the achievement catalogue).
 */
export default function globalSetup() {
  const name = new URL(E2E.databaseUrl).pathname.slice(1);
  if (!/e2e|test/i.test(name)) throw new Error(`Refusing to touch "${name}": the e2e database name must contain "e2e" or "test".`);
  const env = { ...process.env, DATABASE_URL: E2E.databaseUrl };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx prisma db execute --stdin --schema prisma/schema.prisma", { env, input: TRUNCATE_ALL, stdio: ["pipe", "inherit", "inherit"] });
  execSync("node scripts/seed.ts", { env, stdio: "inherit" });
}
