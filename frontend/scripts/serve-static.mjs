import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, "..", "dist");
const staticRoot = path.resolve(process.env.STATIC_ROOT || defaultRoot);
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

const noFallbackPrefixes = ["/assets/", "/brand/", "/src/", "/node_modules/"];
const noFallbackFiles = new Set(["/env.js", "/favicon.ico"]);

function resolveInsideRoot(urlPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(staticRoot, `.${normalizedPath}`);

  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${path.sep}`)) {
    return null;
  }

  return filePath;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(ext) || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
  });

  fs.createReadStream(filePath).pipe(res);
}

function sendNotFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function shouldSkipFallback(urlPath) {
  return noFallbackFiles.has(urlPath) || noFallbackPrefixes.some((prefix) => urlPath.startsWith(prefix));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const urlPath = url.pathname;
  const requestedPath = resolveInsideRoot(urlPath);

  if (!requestedPath) {
    sendNotFound(res);
    return;
  }

  const filePath = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isDirectory()
    ? path.join(requestedPath, "index.html")
    : requestedPath;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  if (shouldSkipFallback(urlPath)) {
    sendNotFound(res);
    return;
  }

  const indexPath = path.join(staticRoot, "index.html");
  if (fs.existsSync(indexPath)) {
    sendFile(res, indexPath);
    return;
  }

  sendNotFound(res);
});

server.listen(port, host, () => {
  console.log(`Static root: ${staticRoot}`);
  console.log("dist/assets files:");

  const assetsDir = path.join(staticRoot, "assets");
  if (fs.existsSync(assetsDir)) {
    for (const file of fs.readdirSync(assetsDir).sort()) {
      console.log(path.join(assetsDir, file));
    }
  } else {
    console.log(`${assetsDir} not found`);
  }

  console.log(`Static server listening on ${host}:${port}`);
});
