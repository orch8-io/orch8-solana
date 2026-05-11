#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== orch8 Solana Demo Setup ==="

# Kill previous processes
echo "Cleaning up..."
lsof -ti :8080 | xargs kill -9 2>/dev/null || true
sleep 1

# Reset DB
rm -f var/orch8-solana.db var/orch8-solana.db-wal var/orch8-solana.db-shm

# Build
echo "Building..."
npm run build --silent

# Start engine
echo "Starting engine..."
mkdir -p var
./bin/darwin-arm64/orch8-server --config orch8.toml --insecure &
ENGINE_PID=$!
sleep 2

# Deploy sequence
echo "Deploying sequence..."
./bin/darwin-arm64/orch8 deploy demo/recoverable-migration/workflows/defi-migration-recoverable.json

# Start bridge worker
echo "Starting bridge worker..."
node dist/scripts/bridge-worker.js &
WORKER_PID=$!
sleep 1

echo ""
echo "=== Ready ==="
echo "  Engine:    http://127.0.0.1:8080  (pid $ENGINE_PID)"
echo "  Worker:    pid $WORKER_PID"
echo "  Dashboard: http://localhost:5173/"
echo ""
echo "Open the dashboard, then run:"
echo ""
echo "  curl -s -X POST http://127.0.0.1:8080/instances \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"sequence_id\":\"f6914a7e-cdfb-41c6-8062-f8a1c15f87af\",\"tenant_id\":\"default\",\"namespace\":\"solana_demo\",\"context\":{\"data\":{\"demo\":true}}}'"
echo ""
echo "Press Ctrl+C to stop everything."
wait
