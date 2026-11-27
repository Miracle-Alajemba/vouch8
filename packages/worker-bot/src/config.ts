import dotenv from "dotenv";
import path from "node:path";
import { parseUnits, type Hex, type Address, isAddress } from "viem";
import { DEFAULT_VOUCH8_ADDRESSES } from "@vouch8/sdk";

// Load .env from current dir or parent vouch8 root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

export interface WorkerBotConfig {
  rpcUrl: string;
  workerPrivateKey: Hex;
  orchestratorPrivateKey?: Hex;
  minPrice: bigint;
  minPriceFormatted: string;
  maxBidsPerHour: number;
  undercutPercent: number;
  pollIntervalMs: number;
  anthropicApiKey?: string;
  failMode: boolean;
  addresses: {
    registry: Address;
    escrow: Address;
    vault: Address;
    tUSD8: Address;
  };
}

function parseHexKey(envVal?: string, fallback = ""): Hex {
  const val = envVal || fallback;
  if (!val) {
    throw new Error("Missing required private key in environment variables (e.g. WORKER_PRIVATE_KEY).");
  }
  return (val.startsWith("0x") ? val : `0x${val}`) as Hex;
}

export function loadConfig(): WorkerBotConfig {
  const isFailFlag = process.argv.includes("--fail") || process.env.FAIL_MODE === "true";

  const minPriceStr = process.env.MIN_PRICE || "0.10";
  const minPrice = parseUnits(minPriceStr, 6);

  const undercutPercent = parseInt(process.env.UNDERCUT_PERCENT || "10", 10);
  const maxBidsPerHour = parseInt(process.env.MAX_BIDS_PER_HOUR || "30", 10);
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || "3000", 10);

  const registry = (process.env.REGISTRY_ADDRESS || DEFAULT_VOUCH8_ADDRESSES.registry) as Address;
  const escrow = (process.env.ESCROW_ADDRESS || DEFAULT_VOUCH8_ADDRESSES.escrow) as Address;
  const vault = (process.env.VAULT_ADDRESS || DEFAULT_VOUCH8_ADDRESSES.vault) as Address;
  const tUSD8 = (process.env.TUSD8_ADDRESS || DEFAULT_VOUCH8_ADDRESSES.tUSD8) as Address;

  if (!isAddress(registry) || !isAddress(escrow) || !isAddress(vault) || !isAddress(tUSD8)) {
    throw new Error("Invalid contract address configuration.");
  }

  // Allow a default fallback key for zero-config demonstration if needed
  const defaultWorkerKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const workerPrivateKey = parseHexKey(process.env.WORKER_PRIVATE_KEY, defaultWorkerKey);

  const orchestratorPrivateKey = process.env.ORCHESTRATOR_PRIVATE_KEY
    ? parseHexKey(process.env.ORCHESTRATOR_PRIVATE_KEY)
    : undefined;

  return {
    rpcUrl: process.env.RPC_URL || "https://rpc-test.qday.info",
    workerPrivateKey,
    orchestratorPrivateKey,
    minPrice,
    minPriceFormatted: minPriceStr,
    maxBidsPerHour,
    undercutPercent,
    pollIntervalMs,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    failMode: isFailFlag,
    addresses: { registry, escrow, vault, tUSD8 },
  };
}
