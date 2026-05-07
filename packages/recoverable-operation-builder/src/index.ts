import { createHash } from "node:crypto";

export type RecoveryMode = "rollback" | "park_assets" | "ask_user" | "stop";

export interface RecoveryPolicy {
  onFailure: RecoveryMode;
  ifRollbackUnsafe?: RecoveryMode;
  ifAmbiguous?: RecoveryMode;
}

export interface RecoverableStep {
  id: string;
  do: string;
  undo?: string;
  fallback?: string;
  retry?: RetryPolicy;
  userDecision?: UserDecisionPolicy;
  guards?: GuardPolicy[];
  failure?: FailureClassificationPolicy;
}

export interface RetryPolicy {
  max_attempts: number;
  initial_backoff: number;
  max_backoff: number;
  backoff_multiplier?: number;
}

export interface UserDecisionPolicy {
  question: string;
  choices: string[];
  defaultChoice: string;
  timeoutSeconds?: number;
  onTimeout?: string;
  handler?: string;
}

export interface GuardPolicy {
  id: string;
  handler: string;
  params?: Record<string, unknown>;
}

export interface FailureClassificationPolicy {
  classifyWith?: string;
  examples: FailureExample[];
}

export interface FailureExample {
  code: string;
  kind: "transient" | "market_moved" | "capacity" | "user_timeout" | "unsafe";
  recovery: RecoveryMode;
  note?: string;
}

export interface RecoverableOperation {
  name: string;
  id?: string;
  namespace?: string;
  tenantId?: string;
  version?: number;
  createdAt?: string;
  recoveryPolicy: RecoveryPolicy;
  steps: RecoverableStep[];
}

export type BlockDefinition =
  | StepBlock
  | TryCatchBlock
  | RouterBlock;

export interface StepBlock {
  type: "step";
  id: string;
  handler: string;
  params?: Record<string, unknown>;
  retry?: RetryPolicy;
}

export interface TryCatchBlock {
  type: "try_catch";
  id: string;
  try_block: BlockDefinition[];
  catch_block: BlockDefinition[];
}

export interface RouterBlock {
  type: "router";
  id: string;
  routes: Array<{
    condition: string;
    blocks: BlockDefinition[];
  }>;
  default?: BlockDefinition[];
}

export interface Orch8Sequence {
  id: string;
  tenant_id: string;
  name: string;
  namespace: string;
  version: number;
  created_at: string;
  blocks: BlockDefinition[];
}

export interface RecoveryPath {
  text: string;
  mermaid: string;
}

export interface StepInput {
  id: string;
  handler: string;
  retry?: RetryPolicy;
  userDecision?: UserDecisionPolicy;
  guards?: GuardPolicy[];
  failure?: FailureClassificationPolicy;
}

export interface ReversibleStepInput extends StepInput {
  undo: string;
  fallback?: string;
}

export interface FallbackStepInput extends StepInput {
  fallback: string;
  undo?: string;
}

export interface SolTransactionInput {
  name: string;
  id?: string;
  namespace?: string;
  tenantId?: string;
  version?: number;
  createdAt?: string;
  steps: RecoverableStep[];
  recoveryPolicy?: Partial<RecoveryPolicy>;
}

export function solTransaction(input: SolTransactionInput): RecoverableOperation {
  return {
    name: input.name,
    id: input.id,
    namespace: input.namespace ?? "solana",
    tenantId: input.tenantId ?? "default",
    version: input.version ?? 1,
    createdAt: input.createdAt ?? "2026-05-07T00:00:00Z",
    recoveryPolicy: {
      onFailure: input.recoveryPolicy?.onFailure ?? "rollback",
      ifRollbackUnsafe: input.recoveryPolicy?.ifRollbackUnsafe ?? "park_assets",
      ifAmbiguous: input.recoveryPolicy?.ifAmbiguous ?? "ask_user",
    },
    steps: input.steps,
  };
}

export function reversibleStep(input: ReversibleStepInput): RecoverableStep {
  return toRecoverableStep(input);
}

export function step(input: StepInput): RecoverableStep {
  return toRecoverableStep(input);
}

export function fallbackStep(input: FallbackStepInput): RecoverableStep {
  return toRecoverableStep(input);
}

function toRecoverableStep(input: StepInput & { undo?: string; fallback?: string }): RecoverableStep {
  return {
    id: input.id,
    do: input.handler,
    undo: input.undo,
    fallback: input.fallback,
    retry: input.retry,
    userDecision: input.userDecision,
    guards: input.guards,
    failure: input.failure,
  };
}

export function userDecision(input: UserDecisionPolicy): UserDecisionPolicy {
  return input;
}

export function retryPolicy(input: RetryPolicy): RetryPolicy {
  return input;
}

export function guard(input: GuardPolicy): GuardPolicy {
  return input;
}

export function failureClassification(input: FailureClassificationPolicy): FailureClassificationPolicy {
  return input;
}

export function recoverableOperation(operation: RecoverableOperation): Orch8Sequence {
  validateOperation(operation);

  const completedReversibleSteps: RecoverableStep[] = [];
  const blocks: BlockDefinition[] = [];

  for (const step of operation.steps) {
    blocks.push({
      type: "try_catch",
      id: `${step.id}_recoverable`,
      try_block: [...guardSteps(step), forwardStep(step)],
      catch_block: buildRecoveryBlocks(step, completedReversibleSteps, operation.recoveryPolicy),
    });

    if (step.undo) {
      completedReversibleSteps.push(step);
    }
  }

  return {
    id: operation.id ?? stableSequenceId(operation.namespace ?? "solana", operation.name),
    tenant_id: operation.tenantId ?? "default",
    name: operation.name,
    namespace: operation.namespace ?? "solana",
    version: operation.version ?? 1,
    created_at: operation.createdAt ?? "2026-05-07T00:00:00Z",
    blocks,
  };
}

export function describeRecoveryPath(operation: RecoverableOperation): RecoveryPath {
  validateOperation(operation);

  const lines = [`Operation: ${operation.name}`, ""];
  const mermaid = ["flowchart LR"];
  const completed: RecoverableStep[] = [];

  for (const step of operation.steps) {
    const label = stepLabel(step);
    lines.push(`- ${step.id}: do '${step.do}'`);
    mermaid.push(`  ${nodeId(step.id)}["${label}"]`);

    if (step.guards && step.guards.length > 0) {
      lines.push(`  - guard checks: ${step.guards.map((guard) => guard.handler).join(", ")}`);
    }

    if (step.undo) {
      lines.push(`  - if a later step fails: can undo with '${step.undo}'`);
    } else {
      lines.push("  - not reversible");
    }

    if (step.userDecision) {
      lines.push(`  - if this step fails: ask user '${step.userDecision.question}'`);
      if (step.userDecision.timeoutSeconds) {
        lines.push(`  - if no answer in ${step.userDecision.timeoutSeconds}s: ${step.userDecision.onTimeout ?? step.userDecision.defaultChoice}`);
      }
      mermaid.push(`  ${nodeId(step.id)} --> ${nodeId(`${step.id}_ask_user`)}["ask user"]`);
    } else if (step.fallback) {
      lines.push(`  - if this step fails: recover with '${step.fallback}'`);
      mermaid.push(`  ${nodeId(step.id)} --> ${nodeId(`${step.id}_fallback`)}["${step.fallback}"]`);
    } else if (completed.some((completedStep) => completedStep.undo)) {
      const undoChain = completed
        .filter((completedStep) => completedStep.undo)
        .reverse()
        .map((completedStep) => completedStep.undo)
        .join(" -> ");
      lines.push(`  - if this step fails: rollback via ${undoChain}`);
    } else {
      lines.push(`  - if this step fails: ${operation.recoveryPolicy.ifRollbackUnsafe ?? operation.recoveryPolicy.onFailure}`);
    }

    if (step.failure) {
      const examples = step.failure.examples
        .map((example) => `${example.code} -> ${example.recovery}`)
        .join(", ");
      lines.push(`  - failure classes: ${examples}`);
    }

    completed.push(step);
  }

  for (let index = 0; index < operation.steps.length - 1; index += 1) {
    mermaid.push(`  ${nodeId(operation.steps[index]!.id)} --> ${nodeId(operation.steps[index + 1]!.id)}`);
  }

  return {
    text: `${lines.join("\n")}\n`,
    mermaid: `${mermaid.join("\n")}\n`,
  };
}

function guardSteps(step: RecoverableStep): StepBlock[] {
  return (step.guards ?? []).map((guard) => ({
    type: "step",
    id: `${step.id}_guard_${guard.id}`,
    handler: guard.handler,
    params: guard.params,
  }));
}

function forwardStep(step: RecoverableStep): StepBlock {
  return {
    type: "step",
    id: step.id,
    handler: step.do,
    retry: step.retry,
    params: step.failure
      ? {
          failure_examples: step.failure.examples,
        }
      : undefined,
  };
}

function buildRecoveryBlocks(
  failedStep: RecoverableStep,
  completedReversibleSteps: RecoverableStep[],
  policy: RecoveryPolicy,
): BlockDefinition[] {
  const blocks: BlockDefinition[] = [];

  if (failedStep.failure?.classifyWith) {
    blocks.push({
      type: "step",
      id: `${failedStep.id}_classify_failure`,
      handler: failedStep.failure.classifyWith,
      params: {
        failed_step: failedStep.id,
        examples: failedStep.failure.examples,
      },
    });
  }

  if (failedStep.userDecision) {
    blocks.push(...askUser(failedStep));
    return blocks;
  }

  if (failedStep.fallback) {
    blocks.push({
      type: "step",
      id: `${failedStep.id}_fallback`,
      handler: failedStep.fallback,
      params: { failed_step: failedStep.id },
    });
    return blocks;
  }

  if (policy.onFailure === "rollback") {
    const reverseSteps = [...completedReversibleSteps].reverse();

    if (reverseSteps.length > 0) {
      blocks.push(
        ...reverseSteps.map((step) => ({
          type: "step" as const,
          id: `${failedStep.id}_undo_${step.id}`,
          handler: step.undo!,
          params: { original_step: step.id },
        })),
      );
      return blocks;
    }

    blocks.push(...fallbackForUnsafeRollback(failedStep, policy));
    return blocks;
  }

  if (policy.onFailure === "park_assets") {
    blocks.push(...parkAssets(failedStep));
    return blocks;
  }

  if (policy.onFailure === "ask_user") {
    blocks.push(...askUser(failedStep));
    return blocks;
  }

  blocks.push({
    type: "step",
    id: `${failedStep.id}_mark_failed`,
    handler: "mark_operation_failed",
    params: { failed_step: failedStep.id },
  });
  return blocks;
}

function fallbackForUnsafeRollback(
  failedStep: RecoverableStep,
  policy: RecoveryPolicy,
): BlockDefinition[] {
  if (policy.ifRollbackUnsafe === "park_assets") {
    return parkAssets(failedStep);
  }

  if (policy.ifRollbackUnsafe === "ask_user") {
    return askUser(failedStep);
  }

  return [
    {
      type: "step",
      id: `${failedStep.id}_manual_review`,
      handler: "request_operator_review",
      params: { failed_step: failedStep.id },
    },
  ];
}

function parkAssets(failedStep: RecoverableStep): BlockDefinition[] {
  return [
    {
      type: "step",
      id: `${failedStep.id}_park_assets`,
      handler: "park_assets",
      params: { failed_step: failedStep.id },
    },
  ];
}

function askUser(failedStep: RecoverableStep): BlockDefinition[] {
  const decision = failedStep.userDecision;

  return [
    {
      type: "step",
      id: `${failedStep.id}_ask_user`,
      handler: decision?.handler ?? "ask_user",
      params: {
        failed_step: failedStep.id,
        question: decision?.question ?? "The operation failed. Should orch8 retry, roll back, park assets, or wait?",
        choices: decision?.choices ?? ["retry", "rollback", "park_assets", "wait"],
        default: decision?.defaultChoice ?? "park_assets",
        timeout_seconds: decision?.timeoutSeconds ?? 300,
        on_timeout: decision?.onTimeout ?? decision?.defaultChoice ?? "park_assets",
      },
    },
  ];
}

function validateOperation(operation: RecoverableOperation): void {
  if (!operation.name.trim()) {
    throw new Error("Give this recoverable operation a name, for example 'defi_migration'");
  }

  if (operation.steps.length === 0) {
    throw new Error("Add at least one operation step with a 'do' handler");
  }

  const ids = new Set<string>();
  for (const step of operation.steps) {
    if (!step.id.trim()) {
      throw new Error("Every operation step needs a short id, for example 'withdraw_collateral'");
    }
    if (!step.do.trim()) {
      throw new Error(`Step '${step.id}' needs a 'do' handler`);
    }
    if (step.userDecision) {
      if (!step.userDecision.question.trim()) {
        throw new Error(`Step '${step.id}' user decision needs a question`);
      }
      if (step.userDecision.choices.length === 0) {
        throw new Error(`Step '${step.id}' user decision needs at least one choice`);
      }
      if (!step.userDecision.choices.includes(step.userDecision.defaultChoice)) {
        throw new Error(`Step '${step.id}' user decision default must be one of its choices`);
      }
      if (step.userDecision.timeoutSeconds !== undefined && step.userDecision.timeoutSeconds <= 0) {
        throw new Error(`Step '${step.id}' user decision timeout must be greater than zero seconds`);
      }
      if (step.userDecision.onTimeout && !step.userDecision.choices.includes(step.userDecision.onTimeout)) {
        throw new Error(`Step '${step.id}' user decision timeout action must be one of its choices`);
      }
    }
    const guardIds = new Set<string>();
    for (const guard of step.guards ?? []) {
      if (!guard.id.trim()) {
        throw new Error(`Step '${step.id}' has a guard without an id`);
      }
      if (!guard.handler.trim()) {
        throw new Error(`Guard '${guard.id}' on step '${step.id}' needs a handler`);
      }
      if (guardIds.has(guard.id)) {
        throw new Error(`Guard id '${guard.id}' is used more than once on step '${step.id}'`);
      }
      guardIds.add(guard.id);
    }
    if (step.failure) {
      if (step.failure.classifyWith !== undefined && !step.failure.classifyWith.trim()) {
        throw new Error(`Step '${step.id}' failure classification handler cannot be empty`);
      }
      if (step.failure.examples.length === 0) {
        throw new Error(`Step '${step.id}' failure classification needs at least one example`);
      }
      for (const example of step.failure.examples) {
        if (!example.code.trim()) {
          throw new Error(`Step '${step.id}' has a failure example without a code`);
        }
      }
    }
    if (ids.has(step.id)) {
      throw new Error(`Step id '${step.id}' is used more than once; choose unique step ids`);
    }
    ids.add(step.id);
  }
}

function stepLabel(step: RecoverableStep): string {
  return step.do.replaceAll("_", " ");
}

function nodeId(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_]/g, "_");
}

export function stableSequenceId(namespace: string, name: string): string {
  const hash = createHash("sha256").update(`${namespace}:${name}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}
