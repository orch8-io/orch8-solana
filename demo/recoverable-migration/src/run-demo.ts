import {
  createInitialDemoState,
  type DemoState,
  type HandlerFailure,
  type HandlerResponse,
} from "../../../packages/solana-worker/src/index.js";
import { demoHandlers } from "../../../packages/solana-worker/src/handlers.js";

interface Step {
  id: string;
  handler: string;
  undo?: string;
  fallback?: string;
}

const steps: Step[] = [
  { id: "withdraw_collateral", handler: "withdraw_collateral", undo: "redeposit_collateral" },
  { id: "claim_rewards", handler: "claim_rewards" },
  { id: "swap_rewards", handler: "swap_rewards_to_usdc", undo: "swap_usdc_to_rewards" },
  { id: "deposit_protocol_b", handler: "deposit_protocol_b", fallback: "park_assets" },
  { id: "enable_leverage", handler: "enable_leverage" },
];

function main(): void {
  console.log("Recoverable Position Migration Demo");
  console.log("====================================\n");

  runUnprotected();
  console.log("\n------------------------------------\n");
  runRecoverable();
}

function runUnprotected(): void {
  console.log("Unprotected migration");
  let state = createInitialDemoState();
  printState("Initial", state);

  for (const step of steps) {
    const result = runHandler(step.handler, state);
    state = result.state;

    if (!result.ok) {
      printFailure(step.id, result);
      printState("Stopped with assets idle", state);
      return;
    }

    console.log(`ok   ${step.id}: ${result.status}`);
  }

  printState("Completed", state);
}

function runRecoverable(): void {
  console.log("Recoverable migration");
  let state = createInitialDemoState();
  const completed: Step[] = [];
  printState("Initial", state);

  for (const step of steps) {
    const result = runHandler(step.handler, state);
    state = result.state;

    if (result.ok) {
      completed.push(step);
      console.log(`ok   ${step.id}: ${result.status}`);
      continue;
    }

    printFailure(step.id, result);

    if (step.fallback) {
      console.log(`recovery ${step.id}: ${step.fallback}`);
      const fallback = runHandler(step.fallback, state);
      state = fallback.state;

      if (!fallback.ok) {
        printFailure(step.fallback, fallback);
        state = rollback(completed, state);
        printState("Rollback after failed recovery", state);
        return;
      }

      console.log(`ok   ${step.fallback}: ${fallback.status}`);
      printState("Recovered with assets parked", state);
      return;
    }

    state = rollback(completed, state);
    printState("Rolled back", state);
    return;
  }

  printState("Completed", state);
}

function rollback(completed: Step[], current: DemoState): DemoState {
  let state = current;
  const reversible = completed.filter((step) => step.undo).reverse();

  for (const step of reversible) {
    const undo = step.undo!;
    console.log(`rollback ${step.id}: ${undo}`);
    const result = runHandler(undo, state);
    state = result.state;

    if (!result.ok) {
      printFailure(undo, result);
      return state;
    }

    console.log(`ok   ${undo}: ${result.status}`);
  }

  return state;
}

function runHandler(handlerName: string, state: DemoState): HandlerResponse {
  const handler = demoHandlers[handlerName];

  if (!handler) {
    return {
      ok: false,
      error: {
        type: "permanent",
        code: "handler_not_found",
        message: `Handler '${handlerName}' is not registered`,
      },
      state,
    };
  }

  return handler(state);
}

function printFailure(stepId: string, result: HandlerFailure): void {
  console.log(`fail ${stepId}: ${result.error.code} - ${result.error.message}`);
}

function printState(label: string, state: DemoState): void {
  console.log(
    `${label}: wallet=${state.walletCollateral}, protocolA=${state.protocolA}, protocolB=${state.protocolB}, moneyMarket=${state.moneyMarket}, usdc=${state.walletUsdc}`,
  );
}

main();

