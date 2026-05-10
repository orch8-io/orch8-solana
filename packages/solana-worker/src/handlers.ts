import {
  askUser,
  claimRewards,
  checkTreasuryBalances,
  depositProtocolB,
  depositTreasuryYield,
  enableLeverage,
  type DemoState,
  parkAssets,
  publishTreasuryReport,
  redepositCollateral,
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
