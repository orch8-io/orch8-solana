import { spawnSync } from "node:child_process";
import {
  createInitialDemoState,
  type DemoState,
} from "../packages/solana-worker/src/index.js";
import { runHandler } from "../packages/solana-worker/src/handlers.js";
import { migrationSteps } from "../packages/solana-worker/src/steps.js";
import { runLocalSolanaProof } from "./validate-local-solana.js";

interface MigrationProof {
  unprotectedIdle: boolean;
  recovered: boolean;
  failureCode: string;
  recoveryPath: string;
  unprotectedState: DemoState;
  recoveredState: DemoState;
}

interface ProofRow {
  proof: string;
  status: "OK" | "FAIL";
}

async function main(): Promise<void> {
  console.log("orch8 Solana Wow Demo");
  console.log("======================\n");

  console.log("1. Starting local Solana validator");
  const solanaProof = await runLocalSolanaProof();
  console.log(`   Confirmed transfer: ${solanaProof.signature}`);
  console.log(`   Receiver balance: ${solanaProof.receiverLamports} lamports\n`);

  console.log("2. Running recoverable migration proof");
  const migrationProof = runMigrationProof();
  console.log(`   Failure: ${migrationProof.failureCode}`);
  console.log(`   Recovery path: ${migrationProof.recoveryPath}`);
  console.log(`   Unprotected state: ${formatState(migrationProof.unprotectedState)}`);
  console.log(`   Recovered state:   ${formatState(migrationProof.recoveredState)}\n`);

  console.log("3. Validating generated workflows against local engine");
  runNodeScript("dist/demo/recoverable-migration/src/build-workflow.js");
  runNodeScript("dist/scripts/validate-workflows.js");
  console.log("   Workflow validation passed\n");

  printProofTable([
    { proof: "Local Solana validator reachable", status: "OK" },
    { proof: "Real transaction confirmed", status: solanaProof.receiverLamports === 100_000_000 ? "OK" : "FAIL" },
    { proof: "Multi-step operation failed mid-flight", status: migrationProof.unprotectedIdle ? "OK" : "FAIL" },
    { proof: "Recovery branch executed", status: migrationProof.recovered ? "OK" : "FAIL" },
    { proof: "Workflow accepted by local engine", status: "OK" },
  ]);
}

function runMigrationProof(): MigrationProof {
  const unprotected = runUnprotectedMigration();
  const recovered = runRecoverableMigration();

  return {
    unprotectedIdle:
      unprotected.failureCode === "protocol_b_capacity_full" &&
      unprotected.state.walletCollateral === 100 &&
      unprotected.state.moneyMarket === 0,
    recovered:
      recovered.failureCode === "protocol_b_capacity_full" &&
      recovered.recoveryPath === "park_assets" &&
      recovered.state.walletCollateral === 0 &&
      recovered.state.moneyMarket === 100,
    failureCode: recovered.failureCode,
    recoveryPath: recovered.recoveryPath,
    unprotectedState: unprotected.state,
    recoveredState: recovered.state,
  };
}

function runUnprotectedMigration(): { failureCode: string; state: DemoState } {
  let state = createInitialDemoState();

  for (const step of migrationSteps) {
    const result = runHandler(step.handler, state);
    state = result.state;

    if (!result.ok) {
      return { failureCode: result.error.code, state };
    }
  }

  return { failureCode: "none", state };
}

function runRecoverableMigration(): { failureCode: string; recoveryPath: string; state: DemoState } {
  let state = createInitialDemoState();

  for (const step of migrationSteps) {
    const result = runHandler(step.handler, state);
    state = result.state;

    if (result.ok) {
      continue;
    }

    if (!step.fallback) {
      return { failureCode: result.error.code, recoveryPath: "rollback", state };
    }

    const fallback = runHandler(step.fallback, state);
    state = fallback.state;
    return { failureCode: result.error.code, recoveryPath: step.fallback, state };
  }

  return { failureCode: "none", recoveryPath: "none", state };
}

function runNodeScript(script: string): void {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Failed to run ${script}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function printProofTable(rows: ProofRow[]): void {
  const proofWidth = Math.max(...rows.map((row) => row.proof.length), "Proof".length);
  const statusWidth = "Status".length;

  console.log("Proof".padEnd(proofWidth, " ") + "  " + "Status".padEnd(statusWidth, " "));
  console.log("-".repeat(proofWidth) + "  " + "-".repeat(statusWidth));

  for (const row of rows) {
    console.log(row.proof.padEnd(proofWidth, " ") + "  " + row.status);
  }
}

function formatState(state: DemoState): string {
  return [
    `wallet=${state.walletCollateral}`,
    `protocolA=${state.protocolA}`,
    `protocolB=${state.protocolB}`,
    `moneyMarket=${state.moneyMarket}`,
    `usdc=${state.walletUsdc}`,
  ].join(", ");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
