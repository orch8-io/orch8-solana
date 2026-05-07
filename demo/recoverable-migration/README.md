# Recoverable Migration Demo

This demo models a DeFi position migration:

1. withdraw collateral from Protocol A,
2. claim rewards,
3. swap rewards to USDC,
4. deposit collateral into Protocol B,
5. enable leverage.

Protocol B starts at capacity, so the deposit step fails. The generated recoverable workflow can reverse earlier steps or park assets depending on the policy.

```bash
npm run demo:run
npm run demo:build-workflow
```

`demo:run` shows the failure and recovery path in one terminal command. `demo:build-workflow` regenerates both workflow files under `demo/recoverable-migration/workflows/`.
