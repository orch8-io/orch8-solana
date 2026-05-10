import {
  createInitialDemoState,
  type DemoState,
  type HandlerFailure,
} from "../../../packages/solana-worker/src/index.js";
import { runHandler } from "../../../packages/solana-worker/src/handlers.js";
import { migrationSteps, type DemoStep } from "../../../packages/solana-worker/src/steps.js";

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

  for (const step of migrationSteps) {
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
  const completed: DemoStep[] = [];
  printState("Initial", state);

  for (const step of migrationSteps) {
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

function rollback(completed: DemoStep[], current: DemoState): DemoState {
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

function printFailure(stepId: string, result: HandlerFailure): void {
  console.log(`fail ${stepId}: ${result.error.code} - ${result.error.message}`);
}

function printState(label: string, state: DemoState): void {
  console.log(
    `${label}: wallet=${state.walletCollateral}, protocolA=${state.protocolA}, protocolB=${state.protocolB}, moneyMarket=${state.moneyMarket}, usdc=${state.walletUsdc}`,
  );
}

main();

