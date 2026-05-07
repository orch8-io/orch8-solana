import { deepEqual, equal, match, ok, throws } from "node:assert/strict";
import {
  failureClassification,
  fallbackStep,
  guard,
  recoverableOperation,
  retryPolicy,
  reversibleStep,
  solTransaction,
  step,
  type StepBlock,
  type TryCatchBlock,
  userDecision,
} from "../packages/recoverable-operation-builder/src/index.js";

const operation = solTransaction({
  name: "constructor_validation",
  namespace: "solana_demo",
  createdAt: "2026-05-07T00:00:00Z",
  steps: [
    reversibleStep({
      id: "withdraw",
      handler: "withdraw_collateral",
      undo: "redeposit_collateral",
      guards: [
        guard({
          id: "balance",
          handler: "check_withdrawable_balance",
          params: { minimum_collateral: 100 },
        }),
      ],
      retry: retryPolicy({
        max_attempts: 3,
        initial_backoff: 1000,
        max_backoff: 5000,
        backoff_multiplier: 2,
      }),
    }),
    reversibleStep({
      id: "swap",
      handler: "swap_rewards_to_usdc",
      undo: "swap_usdc_to_rewards",
      userDecision: userDecision({
        question: "Swap failed. Retry, roll back, park assets, or wait?",
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
      id: "deposit",
      handler: "deposit_protocol_b",
      fallback: "park_assets",
    }),
    step({
      id: "enable",
      handler: "enable_leverage",
    }),
  ],
});

const sequence = recoverableOperation(operation);
equal(sequence.name, "constructor_validation");
equal(sequence.namespace, "solana_demo");
equal(sequence.blocks.length, 4);

const withdraw = sequence.blocks[0] as TryCatchBlock;
equal(withdraw.type, "try_catch");
equal(withdraw.try_block.length, 2);

const withdrawGuard = withdraw.try_block[0] as StepBlock;
equal(withdrawGuard.id, "withdraw_guard_balance");
equal(withdrawGuard.handler, "check_withdrawable_balance");
deepEqual(withdrawGuard.params, { minimum_collateral: 100 });

const withdrawStep = withdraw.try_block[1] as StepBlock;
equal(withdrawStep.id, "withdraw");
equal(withdrawStep.retry?.max_attempts, 3);

const swap = sequence.blocks[1] as TryCatchBlock;
equal(swap.catch_block.length, 2);
const classifyFailure = swap.catch_block[0] as StepBlock;
equal(classifyFailure.id, "swap_classify_failure");
equal(classifyFailure.handler, "classify_solana_failure");

const askUser = swap.catch_block[1] as StepBlock;
equal(askUser.id, "swap_ask_user");
equal(askUser.handler, "ask_user");
equal(askUser.params?.timeout_seconds, 300);
equal(askUser.params?.on_timeout, "park_assets");

const deposit = sequence.blocks[2] as TryCatchBlock;
const depositFallback = deposit.catch_block[0] as StepBlock;
equal(depositFallback.handler, "park_assets");

const enable = sequence.blocks[3] as TryCatchBlock;
const enableRollback = enable.catch_block.map((block) => (block as StepBlock).handler);
deepEqual(enableRollback, ["swap_usdc_to_rewards", "redeposit_collateral"]);

throws(
  () =>
    recoverableOperation(
      solTransaction({
        name: "bad_decision",
        steps: [
          step({
            id: "bad",
            handler: "handler",
            userDecision: userDecision({
              question: "Choose",
              choices: ["park_assets"],
              defaultChoice: "rollback",
            }),
          }),
        ],
      }),
    ),
  /user decision default must be one of its choices/,
);

throws(
  () =>
    recoverableOperation(
      solTransaction({
        name: "bad_guards",
        steps: [
          step({
            id: "guarded",
            handler: "handler",
            guards: [
              guard({ id: "same", handler: "first_guard" }),
              guard({ id: "same", handler: "second_guard" }),
            ],
          }),
        ],
      }),
    ),
  /Guard id 'same' is used more than once/,
);

throws(
  () =>
    recoverableOperation(
      solTransaction({
        name: "bad_classification",
        steps: [
          step({
            id: "classified",
            handler: "handler",
            failure: failureClassification({
              classifyWith: "",
              examples: [
                {
                  code: "slippage_exceeded",
                  kind: "market_moved",
                  recovery: "ask_user",
                },
              ],
            }),
          }),
        ],
      }),
    ),
  /failure classification handler cannot be empty/,
);

match(sequence.id, /^[0-9a-f-]{36}$/);
ok(sequence.blocks.every((block) => block.type === "try_catch"));

console.log("Constructor validation passed");
