# Demo Evidence

The demo proves one claim:

> A Solana transaction can be atomic while the user's operation is still left half-finished.

## Command

```bash
npm install
npm run demo:frontier
```

The command runs the migration demo, regenerates workflow JSON, starts a temporary local engine, and validates both generated workflows.

For a local-chain smoke test:

```bash
npm run validate:local-solana
```

That command starts `solana-test-validator`, requests an airdrop, transfers lamports, confirms the transaction, checks balances, and shuts the validator down.

For the committee-facing combined proof:

```bash
npm run demo:solana-wow
```

## Recording Placeholder

Add the recording or GIF here after capture:

```text
docs/crypto/assets/recoverable-migration-demo.gif
```

Recommended recording target:

- terminal running `npm run demo:frontier`,
- split view with `demo/recoverable-migration/src/build-workflow.ts`,
- optional final frame showing `demo/recoverable-migration/recovery-path.md`.

## Terminal Transcript

```text
Recoverable Position Migration Demo
====================================

Unprotected migration
Initial: wallet=0, protocolA=100, protocolB=0, moneyMarket=0, usdc=0
ok   withdraw_collateral: withdrawn
ok   claim_rewards: rewards_claimed
ok   swap_rewards: swapped
fail deposit_protocol_b: protocol_b_capacity_full - Protocol B is temporarily at capacity
Stopped with assets idle: wallet=100, protocolA=0, protocolB=0, moneyMarket=0, usdc=5

------------------------------------

Recoverable migration
Initial: wallet=0, protocolA=100, protocolB=0, moneyMarket=0, usdc=0
ok   withdraw_collateral: withdrawn
ok   claim_rewards: rewards_claimed
ok   swap_rewards: swapped
fail deposit_protocol_b: protocol_b_capacity_full - Protocol B is temporarily at capacity
recovery deposit_protocol_b: park_assets
ok   park_assets: parked_assets
Recovered with assets parked: wallet=0, protocolA=0, protocolB=0, moneyMarket=100, usdc=5

Validated demo/recoverable-migration/workflows/defi-migration-unprotected.json
Validated demo/recoverable-migration/workflows/defi-migration-recoverable.json
Validated generated workflows against local orch8 engine
```

## Claims Proven

### 1. Partial success creates unsafe user state

The unprotected migration succeeds at withdraw, claim, and swap. It then fails at the Protocol B deposit. The result is idle collateral and USDC in the wallet:

```text
wallet=100, protocolA=0, protocolB=0, moneyMarket=0, usdc=5
```

### 2. The same failure can recover through an explicit operation path

The recoverable migration hits the same Protocol B capacity failure, then follows the configured fallback:

```text
recovery deposit_protocol_b: park_assets
```

The recovered state is safer:

```text
wallet=0, protocolA=0, protocolB=0, moneyMarket=100, usdc=5
```

### 3. The constructor emits deployable workflow JSON

The generated unprotected and recoverable workflow files are accepted by the bundled local engine:

```text
Validated demo/recoverable-migration/workflows/defi-migration-unprotected.json
Validated demo/recoverable-migration/workflows/defi-migration-recoverable.json
```

### 4. Local Solana runtime is reachable

The local Solana smoke test proves the repo can connect to a real validator process:

```text
Local Solana validation passed
signature=<local-validator-transaction-signature>
receiver_lamports=100000000
```

## What To Show First

Lead with the state contrast:

| Flow | Failure | Final collateral state |
| --- | --- | --- |
| Unprotected | Protocol B full | idle in wallet |
| Recoverable | Protocol B full | parked in money market |

Also show the local-chain proof:

```bash
npm run validate:local-solana
```

Then show that this behavior comes from the constructor:

- `reversibleStep` for undo paths,
- `fallbackStep` for parking assets,
- `retryPolicy` for transient failures,
- `userDecision` for ambiguous recovery,
- `guard` for pre-step safety checks.
