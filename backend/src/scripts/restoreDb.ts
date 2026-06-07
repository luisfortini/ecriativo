import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "../config.js";

async function main() {
  const file = path.resolve(process.argv[2] ?? process.env.BACKUP_FILE ?? "");
  if (!file || !fs.existsSync(file)) {
    throw new Error("Informe o arquivo de backup em BACKUP_FILE ou como primeiro argumento.");
  }

  await runCommand("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", config.databaseUrl, file]);
  console.log(JSON.stringify({ status: "ok", restored_from: file }, null, 2));
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
