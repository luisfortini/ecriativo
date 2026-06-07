import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "../config.js";

async function main() {
  const backupDir = path.resolve(process.env.BACKUP_DIR ?? "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(backupDir, `postgres-${timestamp}.dump`);
  await runCommand("pg_dump", ["--format=custom", "--compress=9", "--file", file, config.databaseUrl]);
  console.log(JSON.stringify({ status: "ok", file }, null, 2));
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} saiu com codigo ${code}`));
    });
    child.on("error", reject);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
