# Discord Show & Tell — Colosseum Frontier

Copy-paste each message block below into Discord. Attach the GIF with Message 1.

GIF path: `docs/crypto/assets/recoverable-migration-demo.gif`

Character counts: Msg 1 ~850, Msg 2 ~1100, Msg 3 ~900 (all under 2000 limit)

---

## Message 1 — paste this, attach GIF

**orch8 — Recoverable DeFi Operations for Solana**

A single Solana transaction is atomic. A real user operation is not.

Position migrations, yield rebalances, debt refinancing — they all span multiple transactions across multiple protocols. If step 4 of 6 fails, the chain doesn't know what the user wanted. Collateral sits idle, rewards already claimed, user stuck.

orch8 makes those operations recoverable. Retry transient failures, run explicit reverse handlers, park assets when rollback is unsafe, ask the user when it's ambiguous, resume from persisted state after downtime.

The same 5-step DeFi migration — without and with orch8:

```
Unprotected migration
ok   withdraw_collateral
ok   claim_rewards
ok   swap_rewards
FAIL deposit_protocol_b: capacity full
→ Assets idle in wallet. User stuck.

Recoverable migration (same failure)
ok   withdraw_collateral
ok   claim_rewards
ok   swap_rewards
FAIL deposit_protocol_b: capacity full
recovery → park_assets
ok   park_assets
→ Assets safe in money market. Resume when capacity opens.
```

Same steps. Same failure. Different outcome.

---

## Message 2 — paste this

**How developers define it**

Describe the operation in business terms — the builder compiles it to deployable workflow JSON:

```ts
const op = solTransaction({
  name: "defi_migration",
  recoveryPolicy: {
    onFailure: "rollback",
    ifRollbackUnsafe: "park_assets",
    ifAmbiguous: "ask_user",
  },
  steps: [
    reversibleStep({ id: "withdraw", handler: "withdraw_collateral", undo: "redeposit_collateral" }),
    step({ id: "claim", handler: "claim_rewards" }),
    reversibleStep({ id: "swap", handler: "swap_to_usdc", undo: "swap_usdc_back" }),
    fallbackStep({ id: "deposit", handler: "deposit_protocol_b", fallback: "park_assets" }),
  ],
});
```

Handlers are plain HTTP endpoints — use any Solana SDK, any language.

**Try it:**
```
npm install && npm run demo:frontier
```

**What's real:** recoverable operation constructor, orch8 engine execution, retry/rollback/fallback branches, workflow validation against a local engine, local Solana validator transaction.

**What's mocked:** protocol balances and DeFi tx effects (deterministic for the demo).

GitHub: https://github.com/orch8-io/orch8-solana

---

## Message 3 — paste this

**Same pattern, more flows**

The recoverable operation abstraction covers any multi-step Solana workflow:

- **Yield rebalancing** — withdraw, swap, deposit into a better vault, park if destination is full
- **Liquidation protection** — detect health factor, rescue collateral, classify failure before retrying
- **Leveraged adjustments** — guard health factor at every step, ask user if target leverage becomes unsafe
- **DCA / recurring execution** — persist state, memoize completed outputs, prevent duplicate swaps after crashes
- **DAO treasury ops** — recoverable autonomous operations with signer approval and execution reports

The engine behind this (orch8) already runs in production — durable workflows, state snapshots, circuit breakers, crash recovery. Written in Rust, single binary, one dependency (Postgres).

Feedback welcome, DMs open.
