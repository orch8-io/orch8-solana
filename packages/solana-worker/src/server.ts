import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createInitialDemoState } from "./index.js";
import { demoHandlers } from "./handlers.js";

const port = Number(process.env.PORT ?? 7071);
let state = createInitialDemoState();

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: {
        type: "permanent",
        code: "server_error",
        message: error instanceof Error ? error.message : "Unknown server error",
      },
      state,
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`orch8 Solana worker listening on http://127.0.0.1:${port}`);
});

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

  if (method === "GET" && url.pathname === "/state") {
    json(res, 200, { ok: true, state });
    return;
  }

  if (method === "POST" && url.pathname === "/reset") {
    state = createInitialDemoState();
    json(res, 200, { ok: true, state });
    return;
  }

  if (method === "POST" && url.pathname === "/set-capacity") {
    const body = await readJson(req);
    state = {
      ...state,
      protocolBCapacityAvailable: Boolean(body.available),
      failureMode: body.available ? "none" : "protocol_b_capacity_full",
    };
    json(res, 200, { ok: true, state });
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/handlers/")) {
    const handlerName = decodeURIComponent(url.pathname.slice("/handlers/".length));
    const handler = demoHandlers[handlerName];

    if (!handler) {
      json(res, 404, {
        ok: false,
        error: {
          type: "permanent",
          code: "handler_not_found",
          message: `Handler '${handlerName}' is not registered`,
        },
        state,
      });
      return;
    }

    const result = handler(state);
    state = result.state;
    json(res, result.ok ? 200 : 409, result);
    return;
  }

  json(res, 404, {
    ok: false,
    error: {
      type: "permanent",
      code: "not_found",
      message: `${method} ${url.pathname} is not available`,
    },
    state,
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

