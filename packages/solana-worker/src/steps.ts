export interface DemoStep {
  id: string;
  handler: string;
  undo?: string;
  fallback?: string;
}

export const migrationSteps: DemoStep[] = [
  { id: "withdraw_collateral", handler: "withdraw_collateral", undo: "redeposit_collateral" },
  { id: "claim_rewards", handler: "claim_rewards" },
  { id: "swap_rewards", handler: "swap_rewards_to_usdc", undo: "swap_usdc_to_rewards" },
  { id: "deposit_protocol_b", handler: "deposit_protocol_b", fallback: "park_assets" },
  { id: "enable_leverage", handler: "enable_leverage" },
];
