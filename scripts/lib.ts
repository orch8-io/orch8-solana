import type { ChildProcess } from "node:child_process";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
  });
}

export async function waitForReady(
  child: ChildProcess,
  options: {
    label: string;
    probe: () => Promise<boolean>;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  const interval = options.intervalMs ?? 200;
  const logs: string[] = [];

  child.stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8").trim()));
  child.stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8").trim()));

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        [
          `${options.label} exited before becoming ready`,
          logs.filter(Boolean).join("\n"),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    try {
      if (await options.probe()) {
        return;
      }
    } catch {
      // Not ready yet
    }

    await sleep(interval);
  }

  throw new Error(
    [
      `${options.label} did not become ready`,
      logs.filter(Boolean).join("\n"),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
