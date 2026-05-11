export type DemoFailureMode = "none" | "protocol_b_capacity_full" | "slippage_exceeded";

export interface DemoState {
  walletCollateral: number;
  walletUsdc: number;
  protocolA: number;
  protocolB: number;
  moneyMarket: number;
  protocolBCapacityAvailable: boolean;
  failureMode: DemoFailureMode;
  lastFailureCode: string | null;
  lastFailureClassification: string | null;
  operationFailed: boolean;
  operatorReviewRequested: boolean;
  daoTreasuryUsdc: number;
  daoYieldVenueUsdc: number;
  daoPolicyApproved: boolean;
  daoReportPublished: boolean;
}

export interface HandlerResult {
  ok: true;
  status: string;
  state: DemoState;
  details?: Record<string, unknown>;
}

export interface HandlerFailure {
  ok: false;
  error: {
    type: "retryable" | "permanent" | "recoverable";
    code: string;
    message: string;
  };
  state: DemoState;
}

export type HandlerResponse = HandlerResult | HandlerFailure;

export function createInitialDemoState(): DemoState {
  return {
    walletCollateral: 0,
    walletUsdc: 0,
    protocolA: 100,
    protocolB: 0,
    moneyMarket: 0,
    protocolBCapacityAvailable: false,
    failureMode: "protocol_b_capacity_full",
    lastFailureCode: null,
    lastFailureClassification: null,
    operationFailed: false,
    operatorReviewRequested: false,
    daoTreasuryUsdc: 1_000,
    daoYieldVenueUsdc: 0,
    daoPolicyApproved: true,
    daoReportPublished: false,
  };
}

export function withdrawCollateral(state: DemoState): HandlerResponse {
  if (state.protocolA <= 0) {
    return failure(state, "permanent", "nothing_to_withdraw", "Protocol A position is empty");
  }

  const next = { ...state, walletCollateral: state.walletCollateral + state.protocolA, protocolA: 0 };
  return success(next, "withdrawn");
}

export function redepositCollateral(state: DemoState): HandlerResponse {
  if (state.walletCollateral <= 0) {
    return success(state, "noop_nothing_to_redeposit");
  }

  const next = { ...state, protocolA: state.protocolA + state.walletCollateral, walletCollateral: 0 };
  return success(next, "redeposited");
}

export function claimRewards(state: DemoState): HandlerResponse {
  const next = { ...state, walletUsdc: state.walletUsdc + 5 };
  return success(next, "rewards_claimed");
}

export function swapRewardsToUsdc(state: DemoState): HandlerResponse {
  if (state.failureMode === "slippage_exceeded") {
    return failure(state, "recoverable", "slippage_exceeded", "Swap quote exceeded slippage limit");
  }

  return success(state, "swapped");
}

export function swapUsdcToRewards(state: DemoState): HandlerResponse {
  return success(state, "swap_reversed");
}

export function depositProtocolB(state: DemoState): HandlerResponse {
  if (!state.protocolBCapacityAvailable || state.failureMode === "protocol_b_capacity_full") {
    return failure(
      state,
      "recoverable",
      "protocol_b_capacity_full",
      "Protocol B is temporarily at capacity",
    );
  }

  if (state.walletCollateral <= 0) {
    return failure(state, "permanent", "nothing_to_deposit", "Wallet collateral is empty");
  }

  const next = { ...state, protocolB: state.protocolB + state.walletCollateral, walletCollateral: 0 };
  return success(next, "deposited_protocol_b");
}

export function enableLeverage(state: DemoState): HandlerResponse {
  if (state.protocolB <= 0) {
    return success(state, "noop_nothing_to_leverage");
  }

  return success(state, "leverage_enabled");
}

export function parkAssets(state: DemoState): HandlerResponse {
  if (state.walletCollateral <= 0) {
    return failure(state, "permanent", "nothing_to_park", "Wallet collateral is empty");
  }

  const next = { ...state, moneyMarket: state.moneyMarket + state.walletCollateral, walletCollateral: 0 };
  return success(next, "parked_assets");
}

export function askUser(state: DemoState): HandlerResponse {
  return success(state, "user_prompted", {
    question: "Protocol B is full. Park funds, return to Protocol A, or wait?",
    default: "park_assets",
  });
}

export function checkAssetOwner(state: DemoState): HandlerResponse {
  const totalAssets = state.protocolA + state.walletCollateral + state.protocolB + state.moneyMarket;
  if (totalAssets <= 0) {
    return failure(state, "permanent", "no_assets", "No collateral found in any account");
  }
  return success(state, "asset_owner_verified", { totalAssets });
}

export function checkWithdrawableBalance(state: DemoState): HandlerResponse {
  if (state.protocolA <= 0) {
    return failure(state, "permanent", "insufficient_balance", "Protocol A has no withdrawable balance");
  }
  return success(state, "withdrawable_balance_ok", { available: state.protocolA });
}

export function checkProtocolCapacity(state: DemoState): HandlerResponse {
  if (!state.protocolBCapacityAvailable || state.failureMode === "protocol_b_capacity_full") {
    return failure(state, "recoverable", "protocol_b_capacity_full", "Protocol B is at capacity");
  }
  return success(state, "protocol_capacity_ok");
}

const failureKindMap: Record<string, string> = {
  blockhash_not_found: "transient",
  priority_fee_too_low: "transient",
  slippage_exceeded: "market_moved",
  protocol_b_capacity_full: "capacity",
  protocol_capacity_full: "capacity",
  user_timeout: "user_timeout",
};

export function classifySolanaFailure(state: DemoState): HandlerResponse {
  const code = state.lastFailureCode;
  if (!code) {
    return success(state, "no_failure_to_classify", { kind: "none" });
  }
  const kind = failureKindMap[code] ?? "unknown";
  const next = { ...state, lastFailureClassification: kind };
  return success(next, "failure_classified", { code, kind });
}

export function markOperationFailed(state: DemoState): HandlerResponse {
  const next = { ...state, operationFailed: true };
  return success(next, "operation_marked_failed", {
    lastFailureCode: state.lastFailureCode,
    lastFailureClassification: state.lastFailureClassification,
  });
}

export function requestOperatorReview(state: DemoState): HandlerResponse {
  const next = { ...state, operatorReviewRequested: true };
  return success(next, "operator_review_requested", {
    lastFailureCode: state.lastFailureCode,
    lastFailureClassification: state.lastFailureClassification,
  });
}

export function checkTreasuryBalances(state: DemoState): HandlerResponse {
  if (state.daoTreasuryUsdc <= 0) {
    return failure(state, "permanent", "empty_treasury", "DAO treasury has no available USDC");
  }

  return success(state, "treasury_balances_checked", {
    daoTreasuryUsdc: state.daoTreasuryUsdc,
  });
}

export function verifyGovernancePolicy(state: DemoState): HandlerResponse {
  if (!state.daoPolicyApproved) {
    return failure(
      state,
      "recoverable",
      "policy_approval_missing",
      "DAO policy or signer approval is missing",
    );
  }

  return success(state, "governance_policy_verified");
}

export function depositTreasuryYield(state: DemoState): HandlerResponse {
  if (state.daoTreasuryUsdc <= 0) {
    return failure(state, "permanent", "nothing_to_deposit", "DAO treasury has no funds to deposit");
  }

  const next = {
    ...state,
    daoYieldVenueUsdc: state.daoYieldVenueUsdc + state.daoTreasuryUsdc,
    daoTreasuryUsdc: 0,
  };
  return success(next, "treasury_deposited_to_yield");
}

export function returnToTreasury(state: DemoState): HandlerResponse {
  if (state.daoYieldVenueUsdc <= 0) {
    return failure(state, "permanent", "nothing_to_return", "Yield venue has no DAO funds to return");
  }

  const next = {
    ...state,
    daoTreasuryUsdc: state.daoTreasuryUsdc + state.daoYieldVenueUsdc,
    daoYieldVenueUsdc: 0,
  };
  return success(next, "returned_to_treasury");
}

export function publishTreasuryReport(state: DemoState): HandlerResponse {
  const next = { ...state, daoReportPublished: true };
  return success(next, "treasury_report_published", {
    daoTreasuryUsdc: next.daoTreasuryUsdc,
    daoYieldVenueUsdc: next.daoYieldVenueUsdc,
  });
}

function success(
  state: DemoState,
  status: string,
  details?: Record<string, unknown>,
): HandlerResult {
  return { ok: true, status, state, details };
}

function failure(
  state: DemoState,
  type: HandlerFailure["error"]["type"],
  code: string,
  message: string,
): HandlerFailure {
  return { ok: false, error: { type, code, message }, state };
}
