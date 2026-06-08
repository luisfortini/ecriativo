import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
fs.mkdirSync(distDir, { recursive: true });

const config = {
  VITE_API_URL: process.env.VITE_API_URL ?? ""
};

fs.writeFileSync(path.join(distDir, "env.js"), `window.__APP_CONFIG__ = ${JSON.stringify(config)};\n`);
