import { existsSync, readFileSync } from "node:fs";

export function loadDotEnv(path) {
    if (!existsSync(path)) {
        return;
    }

    const content = readFileSync(path, "utf8");

    for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

        if (!match) {
            continue;
        }

        const [, key, rawValue] = match;
        const value = rawValue.trim().replace(/^["']|["']$/g, "");
        process.env[key] = process.env[key] ?? value;
    }
}
