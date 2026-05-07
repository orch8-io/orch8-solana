import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const rpcUrl = "http://127.0.0.1:8899";

async function main(): Promise<void> {
  const ledgerDir = mkdtempSync(join(tmpdir(), "orch8-solana-validator-"));
  const validator = startValidator(ledgerDir);

  try {
    await waitForValidator(validator);
    await runTransferProof();
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
  const deadline = Date.now() + 30_000;
  const logs: string[] = [];

  validator.stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8").trim()));
  validator.stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8").trim()));

  while (Date.now() < deadline) {
    if (validator.exitCode !== null || validator.signalCode !== null) {
      throw new Error(
        [
          "Local Solana validator exited before becoming ready",
          logs.filter(Boolean).join("\n"),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    try {
      await connection.getLatestBlockhash();
      return;
    } catch {
      await sleep(250);
    }
  }

  throw new Error(
    [
      "Local Solana validator did not become ready",
      logs.filter(Boolean).join("\n"),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function runTransferProof(): Promise<void> {
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

  console.log("Local Solana validation passed");
  console.log(`payer=${payer.publicKey.toBase58()}`);
  console.log(`receiver=${receiver.publicKey.toBase58()}`);
  console.log(`signature=${transferSignature}`);
  console.log(`receiver_lamports=${receiverAfter}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSignature(connection: Connection, signature: string): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const response = await connection.getSignatureStatuses([signature]);
    const status = response.value[0];

    if (status?.err) {
      throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    }

    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for transaction ${signature}`);
}

function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
