import { spawn } from "node:child_process";
import "./write-runtime-env.mjs";

const port = process.env.PORT || "5173";
const child = spawn("npx", ["vite", "preview", "--host", "0.0.0.0", "--port", port], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
