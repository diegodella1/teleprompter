import process from "node:process";
import { loadDotEnv } from "./env-utils.mjs";

loadDotEnv(".env.local");

const required = [
    "TELEPROMPTER_TOKEN_SECRET"
];
let failed = false;

for (const name of required) {
    const value = process.env[name];
    const flags = [];

    if (!value) {
        flags.push("missing");
        failed = true;
    } else {
        if (value.includes("<") || value.includes(">")) {
            flags.push("angle-bracket");
            failed = true;
        }

        if (value.trim() !== value) {
            flags.push("outer-whitespace");
            failed = true;
        }
    }

    console.log(`${name}: ${value ? "present" : "missing"}${flags.length ? ` (${flags.join(",")})` : ""}`);
}

if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    console.log("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: present (must be removed; service role must never be public)");
    failed = true;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;
const serverKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? "present" : "missing"}`);
console.log(`SUPABASE public key: ${publicKey ? "present" : "missing"}`);
console.log(`NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "present" : "missing (required for browser realtime)"}`);
console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "present" : "missing (required for browser realtime)"}`);
console.log(`SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY: ${serverKey ? "present" : "missing (required for server writes)"}`);
console.log(`SUPABASE_DATABASE_URL: ${process.env.SUPABASE_DATABASE_URL ? "present" : "missing (required for npm run db:migrate)"}`);

if (!supabaseUrl || !publicKey || !serverKey) {
    failed = true;
    process.exit(failed ? 1 : 0);
}

const baseUrl = supabaseUrl.replace(/\/$/, "");
const restUrl = `${baseUrl}/rest/v1/`;
const authSettingsUrl = `${baseUrl}/auth/v1/settings`;

await checkValue(authSettingsUrl, "SUPABASE_PUBLIC_KEY", publicKey);
await checkValue(restUrl, "SUPABASE_SERVER_KEY", serverKey);

if (failed) {
    process.exit(1);
}

async function checkKey(restUrl, name) {
    const key = process.env[name];
    await checkValue(restUrl, name, key);
}

async function checkValue(restUrl, name, key) {

    try {
        const response = await fetch(restUrl, {
            headers: createSupabaseHeaders(key)
        });

        console.log(`${name} API check: ${response.status}`);

        if (response.status >= 400) {
            failed = true;
        }
    } catch (error) {
        console.log(`${name} API check: failed (${error instanceof Error ? error.message : "unknown error"})`);
        failed = true;
    }
}

function createSupabaseHeaders(key) {
    if (key.startsWith("sb_")) {
        return {
            apikey: key
        };
    }

    return {
        apikey: key,
        authorization: `Bearer ${key}`
    };
}
