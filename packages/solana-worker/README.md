# Solana Worker

Reusable Solana-oriented handlers for orch8 workflows.

For the Frontier demo these handlers use deterministic in-memory state. The package boundary is intentionally the same one a real Solana integration would use later: transaction builders, send/confirm lifecycle, balance checks, failure classification, recovery actions, and user/operator decisions.

## Run

```bash
npm run worker:start
```

Endpoints:

- `GET /state`
- `POST /reset`
- `POST /set-capacity`
- `POST /handlers/:name`

Example:

```bash
curl -X POST http://127.0.0.1:7071/handlers/withdraw_collateral
```
