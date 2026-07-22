import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await Promise.all(
  ["package-lock.json", "yarn.lock"].map((file) =>
    rm(path.join(repoRoot, file), { force: true }),
  ),
);

if (!process.env.npm_config_user_agent?.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exitCode = 1;
}
