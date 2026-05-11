import { createInitialDemoState, type DemoState } from "../packages/solana-worker/src/index.js";
import { demoHandlers } from "../packages/solana-worker/src/handlers.js";

const ENGINE = "http://127.0.0.1:8080";
const WORKER_ID = "solana-bridge-worker";
const POLL_MS = 500;

let demoState: DemoState = createInitialDemoState();

const KNOWN_HANDLERS = Object.keys(demoHandlers);

interface TaskPayload {
  id: string;
  instance_id: string;
  handler_name: string;
  block_id: string;
  params: Record<string, unknown> | null;
  context: Record<string, unknown>;
  attempt: number;
  state: string;
}

async function discoverHandlers(): Promise<string[]> {
  const res = await fetch(`${ENGINE}/workers/tasks`);
  if (!res.ok) return [];
  const tasks: TaskPayload[] = await res.json();
  const pending = tasks.filter((t) => t.state === "pending");
  const names = new Set(pending.map((t) => t.handler_name));
  for (const h of KNOWN_HANDLERS) names.add(h);
  return [...names];
}

async function pollAndExecute(): Promise<void> {
  const handlers = await discoverHandlers();

  for (const handler of handlers) {
    const res = await fetch(`${ENGINE}/workers/tasks/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handler_name: handler, worker_id: WORKER_ID, limit: 5 }),
    });

    if (!res.ok) continue;

    const tasks: TaskPayload[] = await res.json();

    for (const task of tasks) {
      console.log(`  claimed: ${task.block_id} (${task.handler_name})`);

      const handlerFn = demoHandlers[task.handler_name];
      if (!handlerFn) {
        console.log(`  unknown handler: ${task.handler_name} — completing with noop`);
        await fetch(`${ENGINE}/workers/tasks/${task.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ worker_id: WORKER_ID, output: { status: "noop" } }),
        });
        continue;
      }

      const result = handlerFn(demoState);
      demoState = result.state;

      if (result.ok) {
        console.log(`  completed: ${task.block_id} — ${result.status}`);
        await fetch(`${ENGINE}/workers/tasks/${task.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            worker_id: WORKER_ID,
            output: { status: result.status, ...result.details },
          }),
        });
      } else {
        console.log(`  failed: ${task.block_id} — ${result.error.code}`);
        await fetch(`${ENGINE}/workers/tasks/${task.id}/fail`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            worker_id: WORKER_ID,
            message: result.error.message,
            retryable: result.error.type === "retryable",
          }),
        });
      }
    }
  }
}

async function main(): Promise<void> {
  console.log("orch8 Solana bridge worker started");
  console.log(`  engine: ${ENGINE}`);
  console.log(`  worker: ${WORKER_ID}`);
  console.log(`  polling every ${POLL_MS}ms\n`);
  console.log("State:", JSON.stringify(demoState, null, 2), "\n");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollAndExecute();
    } catch (err) {
      console.error("poll error:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
