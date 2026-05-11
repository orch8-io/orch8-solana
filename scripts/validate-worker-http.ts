import { spawn, type ChildProcess } from "node:child_process";
import { deepEqual, equal } from "node:assert/strict";
import type { DemoState, HandlerFailure, HandlerResponse, HandlerResult } from "../packages/solana-worker/src/index.js";
import { waitForExit, waitForReady } from "./lib.js";

const port = 17071;
const baseUrl = `http://127.0.0.1:${port}`;

async function main(): Promise<void> {
  const worker = startWorker();

  try {
    await waitForWorker(worker);
    await runWorkerProof();
  } finally {
    worker.kill("SIGTERM");
    await waitForExit(worker);
  }
}

function startWorker(): ChildProcess {
  return spawn(process.execPath, ["dist/packages/solana-worker/src/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForWorker(worker: ChildProcess): Promise<void> {
  await waitForReady(worker, {
    label: `Worker at ${baseUrl}`,
    probe: async () => {
      const response = await fetch(`${baseUrl}/state`);
      return response.ok;
    },
    timeoutMs: 10_000,
    intervalMs: 100,
  });
}

async function runWorkerProof(): Promise<void> {
  await post("/reset");

  await expectSuccess("/handlers/withdraw_collateral", "withdrawn");
  await expectSuccess("/handlers/claim_rewards", "rewards_claimed");
  await expectSuccess("/handlers/swap_rewards_to_usdc", "swapped");

  const deposit = await post("/handlers/deposit_protocol_b");
  equal(deposit.ok, false);
  equal((deposit as HandlerFailure).error.code, "protocol_b_capacity_full");
  equal(deposit.state.walletCollateral, 100);

  const recovery = await expectSuccess("/handlers/park_assets", "parked_assets");
  deepEqual(pickState(recovery.state), {
    walletCollateral: 0,
    walletUsdc: 5,
    protocolA: 0,
    protocolB: 0,
    moneyMarket: 100,
  });

  const state = await getState();
  deepEqual(pickState(state), pickState(recovery.state));

  await post("/reset");

  await expectSuccess("/handlers/check_asset_owner", "asset_owner_verified");
  await expectSuccess("/handlers/check_withdrawable_balance", "withdrawable_balance_ok");

  const capacityCheck = await post("/handlers/check_protocol_capacity");
  equal(capacityCheck.ok, false);
  equal((capacityCheck as HandlerFailure).error.code, "protocol_b_capacity_full");

  await expectSuccess("/handlers/withdraw_collateral", "withdrawn");
  const depositFail = await post("/handlers/deposit_protocol_b");
  equal(depositFail.ok, false);

  await expectSuccess("/handlers/classify_solana_failure", "failure_classified");
  await expectSuccess("/handlers/mark_operation_failed", "operation_marked_failed");

  await post("/reset");
  await expectSuccess("/handlers/request_operator_review", "operator_review_requested");

  console.log("Worker HTTP validation passed");
  console.log(`state=${JSON.stringify(pickState(await getState()))}`);
}

async function expectSuccess(path: string, status: string): Promise<HandlerResult> {
  const response = await post(path);
  equal(response.ok, true);
  equal((response as HandlerResult).status, status);
  return response as HandlerResult;
}

async function post(path: string): Promise<HandlerResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: "{}",
  });

  if (![200, 409].includes(response.status)) {
    throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as HandlerResponse;
}

async function getState(): Promise<DemoState> {
  const response = await fetch(`${baseUrl}/state`);

  if (!response.ok) {
    throw new Error(`/state returned ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as { state: DemoState };
  return body.state;
}

function pickState(state: DemoState): Pick<DemoState, "walletCollateral" | "walletUsdc" | "protocolA" | "protocolB" | "moneyMarket"> {
  return {
    walletCollateral: state.walletCollateral,
    walletUsdc: state.walletUsdc,
    protocolA: state.protocolA,
    protocolB: state.protocolB,
    moneyMarket: state.moneyMarket,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
