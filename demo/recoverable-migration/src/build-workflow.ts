import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  describeRecoveryPath,
  fallbackStep,
  failureClassification,
  guard,
  recoverableOperation,
  retryPolicy,
  reversibleStep,
  solTransaction,
  step,
  type RecoverableOperation,
  stableSequenceId,
  userDecision,
} from "../../../packages/recoverable-operation-builder/src/index.js";

const operation: RecoverableOperation = solTransaction({
  name: "defi_migration_recoverable",
  namespace: "solana_demo",
  tenantId: "default",
  version: 1,
  createdAt: "2026-05-07T00:00:00Z",
  recoveryPolicy: {
    onFailure: "rollback",
    ifRollbackUnsafe: "park_assets",
    ifAmbiguous: "ask_user",
  },
  steps: [
    reversibleStep({
      id: "withdraw_collateral",
      handler: "withdraw_collateral",
      undo: "redeposit_collateral",
      guards: [
        guard({
          id: "asset_owner",
          handler: "check_asset_owner",
          params: {
            asset: "collateral",
          },
        }),
        guard({
          id: "withdrawable_balance",
          handler: "check_withdrawable_balance",
          params: {
            minimum_collateral: 100,
          },
        }),
      ],
      retry: retryPolicy({
        max_attempts: 3,
        initial_backoff: 1000,
        max_backoff: 5000,
        backoff_multiplier: 2,
      }),
    }),
    step({
      id: "claim_rewards",
      handler: "claim_rewards",
    }),
    reversibleStep({
      id: "swap_rewards",
      handler: "swap_rewards_to_usdc",
      undo: "swap_usdc_to_rewards",
      retry: retryPolicy({
        max_attempts: 2,
        initial_backoff: 1000,
        max_backoff: 5000,
        backoff_multiplier: 2,
      }),
      userDecision: userDecision({
        question: "Swap route failed. Retry, roll back, park assets, or wait?",
        choices: ["retry", "rollback", "park_assets", "wait"],
        defaultChoice: "park_assets",
        timeoutSeconds: 300,
        onTimeout: "park_assets",
      }),
      failure: failureClassification({
        classifyWith: "classify_solana_failure",
        examples: [
          {
            code: "blockhash_not_found",
            kind: "transient",
            recovery: "rollback",
            note: "Retry while quote is still fresh, otherwise ask the user.",
          },
          {
            code: "slippage_exceeded",
            kind: "market_moved",
            recovery: "ask_user",
            note: "The expected route changed and may no longer match the user's intent.",
          },
          {
            code: "user_timeout",
            kind: "user_timeout",
            recovery: "park_assets",
            note: "Avoid leaving assets idle while waiting for input.",
          },
        ],
      }),
    }),
    fallbackStep({
      id: "deposit_protocol_b",
      handler: "deposit_protocol_b",
      fallback: "park_assets",
      guards: [
        guard({
          id: "protocol_capacity",
          handler: "check_protocol_capacity",
          params: {
            protocol: "protocol_b",
          },
        }),
      ],
      retry: retryPolicy({
        max_attempts: 3,
        initial_backoff: 5000,
        max_backoff: 30000,
        backoff_multiplier: 2,
      }),
      failure: failureClassification({
        classifyWith: "classify_solana_failure",
        examples: [
          {
            code: "priority_fee_too_low",
            kind: "transient",
            recovery: "rollback",
            note: "Retry with a higher fee while the destination is still safe.",
          },
          {
            code: "protocol_capacity_full",
            kind: "capacity",
            recovery: "park_assets",
            note: "Park collateral until capacity opens or the user chooses another destination.",
          },
        ],
      }),
    }),
    step({
      id: "enable_leverage",
      handler: "enable_leverage",
    }),
  ],
});

const recoverableWorkflow = recoverableOperation(operation);
const recoveryPath = describeRecoveryPath(operation);
const verbose = process.argv.includes("--verbose") || process.env.ORCH8_VERBOSE === "1";

const workflowDir = resolve(process.cwd(), "demo/recoverable-migration/workflows");
mkdirSync(workflowDir, { recursive: true });

const recoverablePath = resolve(
  process.cwd(),
  "demo/recoverable-migration/workflows/defi-migration-recoverable.json",
);
const unprotectedPath = resolve(
  process.cwd(),
  "demo/recoverable-migration/workflows/defi-migration-unprotected.json",
);
const recoveryPathPath = resolve(
  process.cwd(),
  "demo/recoverable-migration/recovery-path.md",
);

const unprotectedWorkflow = {
  id: stableSequenceId("solana_demo", "defi_migration_unprotected"),
  tenant_id: "default",
  name: "defi_migration_unprotected",
  namespace: "solana_demo",
  version: 1,
  created_at: "2026-05-07T00:00:00Z",
  blocks: [
    { type: "step", id: "withdraw_collateral", handler: "withdraw_collateral" },
    { type: "step", id: "claim_rewards", handler: "claim_rewards" },
    { type: "step", id: "swap_rewards", handler: "swap_rewards_to_usdc" },
    { type: "step", id: "deposit_protocol_b", handler: "deposit_protocol_b" },
    { type: "step", id: "enable_leverage", handler: "enable_leverage" },
  ],
};

writeFileSync(recoverablePath, `${JSON.stringify(recoverableWorkflow, null, 2)}\n`);
writeFileSync(unprotectedPath, `${JSON.stringify(unprotectedWorkflow, null, 2)}\n`);
writeFileSync(
  recoveryPathPath,
  `# Recoverable Migration Path\n\n${recoveryPath.text}\n\`\`\`mermaid\n${recoveryPath.mermaid}\`\`\`\n`,
);

if (verbose) {
  console.log(JSON.stringify(recoverableWorkflow, null, 2));
}

console.error(`Wrote ${recoverablePath}`);
console.error(`Wrote ${unprotectedPath}`);
console.error(`Wrote ${recoveryPathPath}`);
