import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { waitForExit, waitForReady } from "./lib.js";

const root = process.cwd();
const enginePath = resolve(root, "bin/darwin-arm64/orch8-server");
const cliPath = resolve(root, "bin/darwin-arm64/orch8");
const workflows = [
  "demo/recoverable-migration/workflows/defi-migration-unprotected.json",
  "demo/recoverable-migration/workflows/defi-migration-recoverable.json",
];

async function main(): Promise<void> {
  const workDir = mkdtempSync(join(tmpdir(), "orch8-solana-validate-"));
  const dataDir = join(workDir, "data");
  mkdirSync(dataDir, { recursive: true });

  const port = 18080;
  const engine = startEngine(workDir, dataDir, port);

  try {
    await waitForEngine(engine, port);

    for (const workflow of workflows) {
      deployWorkflow(workflow, port);
    }

    console.log("Validated generated workflows against local orch8 engine");
  } finally {
    engine.kill("SIGTERM");
    await waitForExit(engine);
    rmSync(workDir, { recursive: true, force: true });
  }
}

function startEngine(workDir: string, dataDir: string, port: number): ChildProcess {
  return spawn(enginePath, ["--insecure"], {
    cwd: root,
    env: {
      ...process.env,
      ORCH8_STORAGE_BACKEND: "sqlite",
      ORCH8_DATABASE_URL: join(dataDir, "orch8.db"),
      ORCH8_HTTP_ADDR: `127.0.0.1:${port}`,
      ORCH8_GRPC_ADDR: "127.0.0.1:15051",
      ORCH8_LOG_LEVEL: "warn",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForEngine(engine: ChildProcess, port: number): Promise<void> {
  const url = `http://127.0.0.1:${port}/health/ready`;
  await waitForReady(engine, {
    label: `Engine at ${url}`,
    probe: async () => {
      const response = await fetch(url);
      return response.ok;
    },
  });
}

function deployWorkflow(workflow: string, port: number): void {
  const result = spawnSync(
    cliPath,
    ["--url", `http://127.0.0.1:${port}`, "deploy", workflow, "--json"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        `Failed to deploy ${workflow}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  console.log(`Validated ${workflow}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
