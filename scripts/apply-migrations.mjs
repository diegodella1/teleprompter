import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import pg from "pg";
import { loadDotEnv } from "./env-utils.mjs";

const { Client } = pg;

loadDotEnv(".env.local");

const databaseUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error("Missing SUPABASE_DATABASE_URL. Add the Supabase Postgres connection string to .env.local.");
    process.exit(1);
}

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

const client = new Client({
    connectionString: databaseUrl,
    ssl: requiresSsl(databaseUrl) ? { rejectUnauthorized: false } : false
});

try {
    await client.connect();
    await client.query("create schema if not exists app_migrations");
    await client.query(`
        create table if not exists app_migrations.schema_migrations (
            version text primary key,
            applied_at timestamptz not null default now()
        )
    `);

    for (const migration of migrations) {
        const applied = await client.query("select 1 from app_migrations.schema_migrations where version = $1", [migration]);

        if (applied.rowCount && applied.rowCount > 0) {
            console.log(`Skipping ${migration}`);
            continue;
        }

        const sql = await readFile(join(migrationsDir, migration), "utf8");
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into app_migrations.schema_migrations (version) values ($1)", [migration]);
        await client.query("commit");
        console.log(`Applied ${migration}`);
    }
} catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error(error instanceof Error ? error.message : "Migration failed.");
    process.exitCode = 1;
} finally {
    await client.end().catch(() => undefined);
}

function requiresSsl(connectionString) {
    const hostname = new URL(connectionString).hostname;

    return hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1";
}
