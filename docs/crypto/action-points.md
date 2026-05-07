# Action Points

## Priority 1: Make Recoverable Position Migration Run End-to-End

Build the smallest executable demo around the primary painful flow.

- [x] Add an unprotected migration runner.
- [x] Add a recoverable migration runner.
- [x] Reset demo state before each run.
- [x] Show Protocol B capacity failure deterministically.
- [x] Show the recoverable flow choosing `park_assets`.
- [x] Print before/after balances for wallet, Protocol A, Protocol B, and money market.

Acceptance criteria:

- One command runs both flows.
- The unprotected flow fails with assets idle.
- The recoverable flow ends with assets parked or safely recovered.

## Priority 2: Expose Mock Solana Worker as HTTP Handlers

Turn the in-memory mock handlers into endpoints that orch8 can call.

- [x] Add a small HTTP server under `packages/solana-worker`.
- [x] Add endpoints for `withdraw_collateral`, `redeposit_collateral`, `claim_rewards`, `swap_rewards_to_usdc`, `swap_usdc_to_rewards`, `deposit_protocol_b`, `park_assets`, and `ask_user`.
- [x] Add `/state`, `/reset`, and `/set-capacity` endpoints.
- [x] Return consistent success and failure envelopes.

Acceptance criteria:

- Handlers can be called with `curl`.
- State changes are visible through `/state`.
- Protocol B capacity failure is reproducible.

## Priority 3: Validate Generated Workflows Against orch8

Make sure the friendly constructor emits real workflow JSON, not just plausible JSON.

- [x] Create a script that posts the generated workflow to a local orch8 engine.
- [x] Fix schema mismatches in the builder.
- [x] Add a generated `defi-migration-unprotected.json`.
- [x] Keep generated JSON committed for judges and reviewers.

Acceptance criteria:

- `npm run demo:build-workflow` generates valid orch8 workflow files.
- A local orch8 engine accepts the recoverable workflow.

## Priority 4: Improve the Constructor API for Humans

The builder should feel like describing an operation, not programming a state machine.

- [x] Rename docs around `recoverableOperation` to "constructor."
- [x] Add examples for `reversible_step`, `fallback`, and `ask_user`.
- [x] Add validation errors that explain what the user should do.
- [x] Add a generated Mermaid diagram or text recovery path.
- [x] Add `solTransaction`, `reversibleStep`, `fallbackStep`, `step`, `retryPolicy`, and `userDecision` helpers.

Acceptance criteria:

- A developer can read the README and define a new recoverable flow in under 10 minutes.
- Validation errors mention operation concepts, not internal block schema.

## Priority 5: Prepare Frontier Submission Materials

Package the story for judges.

- [x] Add a top-level "Frontier Demo" section with one command to run.
- [x] Add `npm run demo:frontier` as the one-command local demo and workflow validation path.
- [x] Add "What is real vs mocked" screenshots or terminal output.
- [x] Add the category line: "Recoverable DeFi Operations for Solana."
- [x] Add the positioning line: "Transactions are atomic; operations are not."
- [x] Add a 3-minute recording script.

Acceptance criteria:

- README explains the project in 60 seconds.
- Demo can be recorded without live network dependencies.

## Nice To Have

- [x] Add a minimal browser constructor UI.
- [x] Add flow templates for yield rebalancing and liquidation protection.
- [x] Add AutoDAO treasury rebalancing as the least-priority expansion example.
- [x] Add failure classification examples for blockhash expiry, priority fee, slippage, capacity, and user timeout.
- [x] Add asset guard checks.
- [x] Add user decision timeout defaults.
- [x] Add HN-style post outline after the hackathon.

## Lowest Priority: AutoDAO Expansion

AutoDAO is valuable as the "this gets bigger" story after the DeFi migration demo is working. It should not compete with the Frontier core scope.

- [x] Add `dao_treasury_rebalance` as an example constructor definition.
- [x] Add mock handlers for `check_treasury_balances`, `verify_governance_policy`, `return_to_treasury`, and `publish_treasury_report`.
- [x] Show signer/user decision handling for ambiguous treasury recovery.
- [x] Keep it out of the 3-minute primary demo unless the DeFi demo is already polished.

Acceptance criteria:

- AutoDAO appears as a documented expansion path.
- The core demo still leads with recoverable position migration.
- No real governance integration is built for the hackathon.

## This Week's Cut

Ship only:

1. executable recoverable position migration,
2. mock HTTP worker handlers,
3. generated workflow validation,
4. submission README polish.

Defer:

- real Solana SDK integration,
- real Jupiter or Marginfi adapters,
- AutoDAO implementation,
- generic visual workflow editor,
- broad template catalog.
