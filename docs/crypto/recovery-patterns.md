# Recovery Patterns

These patterns keep the constructor focused on real multi-step operation pain: retries alone are not enough when part of the user's intent has already executed.

```mermaid
flowchart TB
  Start["Step fails"] --> Classify{"Classify\nfailure"}

  Classify -->|"transient\n(blockhash, fees)"| Retry["Retry\nwith backoff"]
  Classify -->|"capacity\n(vault full)"| Park["Park assets\nin safe venue"]
  Classify -->|"market moved\n(slippage)"| Ask["Ask user\nwhat to do"]
  Classify -->|"timeout\n(no response)"| Timeout["Park assets\n(safest default)"]

  Retry -->|"still failing"| Rollback{"Rollback\nsafe?"}
  Ask --> UserChoice{"User\nchoice"}

  Rollback -->|"yes"| Undo["Reverse\ncompleted steps"]
  Rollback -->|"no"| Park

  UserChoice -->|"retry"| Retry
  UserChoice -->|"rollback"| Undo
  UserChoice -->|"park"| Park
  UserChoice -->|"wait"| Wait["Hold & resume\nlater"]

  style Park fill:#fff3cd,stroke:#ffc107,color:#333
  style Undo fill:#cce5ff,stroke:#0d6efd,color:#333
  style Retry fill:#d4edda,stroke:#198754,color:#333
  style Ask fill:#e2d9f3,stroke:#7c3aed,color:#333
```

## Asset Guards

Guards run before the forward step.

Use guards for:

- asset ownership,
- withdrawable balance,
- destination capacity,
- health factor,
- slippage tolerance,
- signer or policy approval.

Example:

```ts
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
});
```

## Failure Classification

Failure classification records known failure cases and their intended recovery path. The generated workflow can add a classification step before rollback, fallback, or user decision.

Useful examples:

| Failure | Kind | Recovery |
| --- | --- | --- |
| `blockhash_not_found` | `transient` | `rollback` or retry while quote is fresh |
| `priority_fee_too_low` | `transient` | `rollback` or retry with a higher fee |
| `slippage_exceeded` | `market_moved` | `ask_user` |
| `protocol_capacity_full` | `capacity` | `park_assets` |
| `user_timeout` | `user_timeout` | `park_assets` |

Example:

```ts
failureClassification({
  classifyWith: "classify_solana_failure",
  examples: [
    {
      code: "slippage_exceeded",
      kind: "market_moved",
      recovery: "ask_user",
      note: "The route changed and may no longer match the user's intent.",
    },
  ],
});
```

## User Decision Timeout

Ambiguous recovery should not wait forever. User decisions include a timeout and a default timeout action.

Example:

```ts
userDecision({
  question: "Swap route failed. Retry, roll back, park assets, or wait?",
  choices: ["retry", "rollback", "park_assets", "wait"],
  defaultChoice: "park_assets",
  timeoutSeconds: 300,
  onTimeout: "park_assets",
});
```

For financial operations, `park_assets` is the safest default when the system cannot prove that rollback or retry still matches the user's intent.
