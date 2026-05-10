import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { waitForSignature } from "./validate-local-solana.js";

const rpcUrl = "https://api.devnet.solana.com";
const explorerBase = "https://explorer.solana.com/tx";
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const payerKeyPath = join(projectRoot, "var", "devnet-payer.json");

export interface DevnetSolanaProof {
  payer: string;
  receiver: string;
  transferSignature: string;
  receiverLamports: number;
  explorerUrl: string;
}

function loadOrCreatePayer(): Keypair {
  if (existsSync(payerKeyPath)) {
    const raw = JSON.parse(readFileSync(payerKeyPath, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }

  mkdirSync(join(projectRoot, "var"), { recursive: true });
  const keypair = Keypair.generate();
  writeFileSync(payerKeyPath, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  return keypair;
}

export async function runDevnetSolanaProof(): Promise<DevnetSolanaProof> {
  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadOrCreatePayer();
  const receiver = Keypair.generate();
  const transferLamports = 10_000_000; // 0.01 SOL — small so one funding lasts many runs

  const balance = await connection.getBalance(payer.publicKey);
  const balanceSol = balance / LAMPORTS_PER_SOL;

  if (balance < transferLamports + 10_000) {
    console.log(`  payer:   ${payer.publicKey.toBase58()}`);
    console.log(`  balance: ${balanceSol} SOL`);
    console.log("");
    console.log("  ┌───────────────────────────────────────────────────────────┐");
    console.log("  │  Payer needs devnet SOL. Fund it once:                    │");
    console.log("  │                                                           │");
    console.log("  │  1. Open https://faucet.solana.com                        │");
    console.log("  │  2. Select 'Devnet'                                       │");
    console.log("  │  3. Paste this address:                                   │");
    console.log(`  │     ${payer.publicKey.toBase58()}  │`);
    console.log("  │  4. Request airdrop                                       │");
    console.log("  │  5. Run this script again                                 │");
    console.log("  │                                                           │");
    console.log("  │  Keypair saved to var/devnet-payer.json (reusable)        │");
    console.log("  └───────────────────────────────────────────────────────────┘");
    console.log("");
    throw new Error("Insufficient devnet SOL — fund the payer and retry");
  }

  console.log(`  payer:   ${payer.publicKey.toBase58()}`);
  console.log(`  balance: ${balanceSol} SOL`);
  console.log("");

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

  console.log("  Submitting SOL transfer on devnet...");
  const transferSignature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  console.log("  Waiting for confirmation...");
  await waitForSignature(connection, transferSignature, 60_000, 500);

  const receiverAfter = await connection.getBalance(receiver.publicKey);

  if (receiverAfter !== transferLamports) {
    throw new Error(
      `Expected receiver to gain ${transferLamports} lamports, got ${receiverAfter}`,
    );
  }

  return {
    payer: payer.publicKey.toBase58(),
    receiver: receiver.publicKey.toBase58(),
    transferSignature,
    receiverLamports: receiverAfter,
    explorerUrl: `${explorerBase}/${transferSignature}?cluster=devnet`,
  };
}

async function main(): Promise<void> {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  orch8 — Devnet Solana Proof");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const proof = await runDevnetSolanaProof();

  console.log("");
  console.log("  ✓ Devnet transfer confirmed");
  console.log("───────────────────────────────────────────────────────────────");
  console.log(`  payer:     ${proof.payer}`);
  console.log(`  receiver:  ${proof.receiver}`);
  console.log(`  amount:    0.01 SOL (${proof.receiverLamports} lamports)`);
  console.log(`  signature: ${proof.transferSignature}`);
  console.log("");
  console.log(`  Explorer:  ${proof.explorerUrl}`);
  console.log("───────────────────────────────────────────────────────────────");
  console.log("");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
