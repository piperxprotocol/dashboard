/// <reference types="@cloudflare/workers-types" />
import { Hono } from "hono";
import { cors } from "hono/cors";
import { onRequestGetMarkets, refreshMarketsAndCache } from "./routes/markets";
import { onRequestGetUserPosition } from "./routes/userPositions";
import type { Env } from './utils/env';

const app = new Hono<{ Bindings: { PIPERX_KV: KVNamespace } }>();


app.use("/api/*", async (c, next) => {
  const openCORSPaths = [
    "/api/price",
    "/api/graphdata",
  ];

  const requestPath = c.req.path;

  const isOpenCORS = openCORSPaths.some(p => requestPath.startsWith(p)) ||
    requestPath.includes("/api/graphdata/") ||
    requestPath.includes("/api/davinci");

  if (isOpenCORS) {
    if (c.req.method === "OPTIONS") {
      return new Response("", {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });

    }

    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    return await next();
  }

  return cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:6173",
      "https://davinci.piperx.xyz",
      "https://banged.ai",
      "http://v1.app.piperx.xyz",
      "https://app.piperx.xyz",
      "https://dev.piperx.xyz",
      "https://og.piperx.xyz",
      "https://og-piperx.pages.dev",
      "https://piperxog-dev.pages.dev",
      "https://piperxbadge-dev.pages.dev",
      "https://badge.piperx.xyz",
      "https://piperxmain.pages.dev",
      "https://piperxmain-gary.pages.dev",
      "https://piperxmain-jingjing.pages.dev",
      "https://piperxmain-zhoulu.pages.dev",
      "https://piperx.xyz",
      "https://piperx-dev.pages.dev",
      "https://www.piperx.xyz",
      "https://loudr.xyz",
      "https://story.d3x.exchange",
      "https://api-auth-staging.playarts.ai",
      "https://api-auth-alpha.playarts.ai",
      "https://app-beta.playarts.ai"
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })(c, next);
});

app.get("/api/lending/markets", async (c) => {
  return await onRequestGetMarkets({ env: c.env });
});

app.get("/api/lending/userPosition", async (c) => {
  return await onRequestGetUserPosition({
    request: c.req.raw,
    env: c.env
  });
});

app.get("/api/lending/init_Markets", async c => {
  await refreshMarketsAndCache(c.env);
  return c.text('Init Markets done');
});



export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  await refreshMarketsAndCache(env);
}
export default app;
