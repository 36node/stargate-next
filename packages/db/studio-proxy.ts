import { createRequire } from "node:module";

// 本地 pnpm studio：从 node_modules 加载 .env；Docker/K8s 无 dotenv 包时跳过。
try {
  createRequire(import.meta.url)("dotenv/config");
} catch {
  // env 由编排注入
}

import { type ChildProcess, spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const STUDIO_AUTH_USER = process.env.STUDIO_AUTH_USER ?? "admin";
const STUDIO_AUTH_PASSWORD =
  process.env.STUDIO_AUTH_PASSWORD ?? "mekong@36node";
const STUDIO_PORT = Number(process.env.STUDIO_PORT ?? 5555);
const STUDIO_INTERNAL_PORT = Number(process.env.STUDIO_INTERNAL_PORT ?? 5556);

if (!(STUDIO_AUTH_USER && STUDIO_AUTH_PASSWORD)) {
  console.error(
    "[studio-proxy] STUDIO_AUTH_USER and STUDIO_AUTH_PASSWORD must be set."
  );
  process.exit(1);
}

const expectedAuthorization = `Basic ${Buffer.from(
  `${STUDIO_AUTH_USER}:${STUDIO_AUTH_PASSWORD}`
).toString("base64")}`;

function isAuthorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization;
  if (!header) {
    return false;
  }
  const a = Buffer.from(header);
  const b = Buffer.from(expectedAuthorization);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function sendUnauthorized(res: ServerResponse): void {
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Prisma Studio"',
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end("Unauthorized");
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const path = req.url?.split("?")[0] ?? "";
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (!isAuthorized(req)) {
    sendUnauthorized(res);
    return;
  }

  proxyToStudio(req, res);
}

function proxyToStudio(req: IncomingMessage, res: ServerResponse): void {
  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: STUDIO_INTERNAL_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end(`Bad Gateway: ${err.message}`);
  });

  req.pipe(proxyReq);
}

let studioProcess: ChildProcess | undefined;

function startStudio(): ChildProcess {
  const child = spawn(
    "prisma",
    ["studio", "--port", String(STUDIO_INTERNAL_PORT), "--browser", "none"],
    { stdio: "inherit", env: process.env }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  });

  return child;
}

function shutdown(): void {
  if (studioProcess && !studioProcess.killed) {
    studioProcess.kill("SIGTERM");
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function waitForStudioReady(): Promise<void> {
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const probe = httpRequest(
          {
            hostname: "127.0.0.1",
            port: STUDIO_INTERNAL_PORT,
            path: "/",
            method: "GET",
          },
          (probeRes) => {
            probeRes.resume();
            resolve();
          }
        );
        probe.on("error", reject);
        probe.end();
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  console.error("[studio-proxy] Prisma Studio did not become ready in time.");
  process.exit(1);
}

async function main(): Promise<void> {
  studioProcess = startStudio();
  await waitForStudioReady();

  const server = createServer(handleRequest);
  server.listen(STUDIO_PORT, () => {
    console.log(
      `[studio-proxy] http://localhost:${STUDIO_PORT} (Basic Auth required)`
    );
  });
}

main().catch((err: unknown) => {
  console.error("[studio-proxy] Failed to start:", err);
  process.exit(1);
});
