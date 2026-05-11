import {
  askUser,
  checkAssetOwner,
  checkProtocolCapacity,
  checkWithdrawableBalance,
  claimRewards,
  checkTreasuryBalances,
  classifySolanaFailure,
  depositProtocolB,
  depositTreasuryYield,
  enableLeverage,
  type DemoState,
  markOperationFailed,
  parkAssets,
  publishTreasuryReport,
  redepositCollateral,
  requestOperatorReview,
  returnToTreasury,
  swapRewardsToUsdc,
  swapUsdcToRewards,
  verifyGovernancePolicy,
  withdrawCollateral,
  type HandlerResponse,
} from "./index.js";

export type DemoHandler = (state: DemoState) => HandlerResponse;

export const demoHandlers: Record<string, DemoHandler> = {
  withdraw_collateral: withdrawCollateral,
  redeposit_collateral: redepositCollateral,
  claim_rewards: claimRewards,
  swap_rewards_to_usdc: swapRewardsToUsdc,
  swap_usdc_to_rewards: swapUsdcToRewards,
  deposit_protocol_b: depositProtocolB,
  enable_leverage: enableLeverage,
  park_assets: parkAssets,
  ask_user: askUser,
  check_asset_owner: checkAssetOwner,
  check_withdrawable_balance: checkWithdrawableBalance,
  check_protocol_capacity: checkProtocolCapacity,
  classify_solana_failure: classifySolanaFailure,
  mark_operation_failed: markOperationFailed,
  request_operator_review: requestOperatorReview,
  check_treasury_balances: checkTreasuryBalances,
  verify_governance_policy: verifyGovernancePolicy,
  deposit_treasury_yield: depositTreasuryYield,
  return_to_treasury: returnToTreasury,
  publish_treasury_report: publishTreasuryReport,
};

export function runHandler(handlerName: string, state: DemoState): HandlerResponse {
  const handler = demoHandlers[handlerName];
  if (!handler) {
    throw new Error(`Handler '${handlerName}' is not registered`);
  }
  return handler(state);
}
