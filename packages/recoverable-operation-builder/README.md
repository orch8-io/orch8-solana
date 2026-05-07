# Recoverable Operation Constructor

Friendly constructor for building recoverable Solana operation workflows.

The builder intentionally keeps the user-facing model small:

- operation name,
- reversible steps,
- optional fallback handlers,
- global recovery policy.

It compiles this model into regular orch8 workflow JSON. This should remain a package-level abstraction until the pattern is proven in real integrations.

## Example

```ts
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
  userDecision,
} from "./src/index.js";

const operation = solTransaction({
  name: "defi_migration_recoverable",
  namespace: "solana_demo",
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
          id: "withdrawable_balance",
          handler: "check_withdrawable_balance",
          params: { minimum_collateral: 100 },
        }),
      ],
      retry: retryPolicy({
        max_attempts: 3,
        initial_backoff: 1000,
        max_backoff: 5000,
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
            code: "slippage_exceeded",
            kind: "market_moved",
            recovery: "ask_user",
          },
        ],
      }),
    }),
    fallbackStep({
      id: "deposit_protocol_b",
      handler: "deposit_protocol_b",
      fallback: "park_assets",
    }),
  ],
});

const sequence = recoverableOperation(operation);
const recoveryPath = describeRecoveryPath(operation);
```

## Constructor Concepts

- `solTransaction`: the top-level operation constructor.
- `step`: a forward-only step.
- `reversibleStep`: a step with an explicit reverse handler.
- `fallbackStep`: a step that should recover through a named fallback handler if it fails.
- `retryPolicy`: retry settings for transient failures.
- `userDecision`: a question and choices for ambiguous recovery.
- `guard`: a pre-step check for balances, ownership, capacity, health factor, or other safety conditions.
- `failureClassification`: examples that explain how known Solana failures should map to recovery behavior.
- `handler`: the forward handler for the step.
- `undo`: the reverse handler used if a later step fails.
- `fallback`: the recovery handler used if this step fails and rollback is not the best path.
- `recoveryPolicy`: the default behavior when a step cannot complete normally.

The generated sequence uses ordinary orch8 blocks, so developers can inspect and modify the JSON before deployment.
