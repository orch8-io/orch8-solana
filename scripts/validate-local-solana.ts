import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { sleep, waitForExit, waitForReady } from "./lib.js";

const rpcUrl = "http://127.0.0.1:8899";

export interface LocalSolanaProof {
  payer: string;
  receiver: string;
  signature: string;
  receiverLamports: number;
}

export async function runLocalSolanaProof(): Promise<LocalSolanaProof> {
  const ledgerDir = mkdtempSync(join(tmpdir(), "orch8-solana-validator-"));
  const validator = startValidator(ledgerDir);

  try {
    await waitForValidator(validator);
    return await runTransferProof();
  } finally {
    validator.kill("SIGTERM");
    await waitForExit(validator);
    rmSync(ledgerDir, { recursive: true, force: true });
  }
}

function startValidator(ledgerDir: string): ChildProcess {
  return spawn(
    "solana-test-validator",
    [
      "--reset",
      "--quiet",
      "--ledger",
      ledgerDir,
      "--rpc-port",
      "8899",
      "--faucet-port",
      "9900",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

async function waitForValidator(validator: ChildProcess): Promise<void> {
  const connection = new Connection(rpcUrl, "confirmed");
  await waitForReady(validator, {
    label: "Local Solana validator",
    probe: async () => {
      await connection.getLatestBlockhash();
      return true;
    },
    intervalMs: 250,
  });
}

async function runTransferProof(): Promise<LocalSolanaProof> {
  const connection = new Connection(rpcUrl, "confirmed");
  const payer = Keypair.generate();
  const receiver = Keypair.generate();
  const transferLamports = 100_000_000;

  const airdropSignature = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
  await waitForSignature(connection, airdropSignature);

  const payerBefore = await connection.getBalance(payer.publicKey);
  const receiverBefore = await connection.getBalance(receiver.publicKey);

  const latest = await connection.getLatestBlockhash();
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: receiver.publicKey,
      lamports: transferLamports,
    }),
  );

  transaction.sign(payer);
  const transferSignature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await waitForSignature(connection, transferSignature);

  const payerAfter = await connection.getBalance(payer.publicKey);
  const receiverAfter = await connection.getBalance(receiver.publicKey);

  if (receiverAfter - receiverBefore !== transferLamports) {
    throw new Error(
      `Expected receiver to gain ${transferLamports} lamports, got ${receiverAfter - receiverBefore}`,
    );
  }

  if (payerAfter >= payerBefore) {
    throw new Error("Expected payer balance to decrease after transfer and fee");
  }

  return {
    payer: payer.publicKey.toBase58(),
    receiver: receiver.publicKey.toBase58(),
    signature: transferSignature,
    receiverLamports: receiverAfter,
  };
}

export async function waitForSignature(
  connection: Connection,
  signature: string,
  timeoutMs = 30_000,
  intervalMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await connection.getSignatureStatuses([signature]);
    const status = response.value[0];

    if (status?.err) {
      throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    }

    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for transaction ${signature}`);
}

async function main(): Promise<void> {
  const proof = await runLocalSolanaProof();
  console.log("Local Solana validation passed");
  console.log(`payer=${proof.payer}`);
  console.log(`receiver=${proof.receiver}`);
  console.log(`signature=${proof.signature}`);
  console.log(`receiver_lamports=${proof.receiverLamports}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
