import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  isAddress,
  type Hex,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// QDay Aevum Testnet Chain Definition
export const qdayAevum = defineChain({
  id: 44005,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.AEVUM_RPC_URL || "https://rpc-test.qday.info"] },
  },
  blockExplorers: {
    default: { name: "Aevum Explorer", url: "https://explorer-test.qday.info" },
  },
});

export const TUSD8_ADDRESS = "0x456569838f1d43009A91ebA4263147Afd7233483" as const;

export const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_DRIP_UNITS = "10"; // 10 tUSD8
export const MAX_DRIP_AMOUNT = parseUnits(MAX_DRIP_UNITS, 6); // 10,000,000

// In-memory + persistent cooldown tracking
const COOLDOWN_FILE = path.resolve(process.cwd(), ".faucet-cooldowns.json");

function loadCooldowns(): Record<string, number> {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      const data = fs.readFileSync(COOLDOWN_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    // ignore parse error, return empty
  }
  return {};
}

function saveCooldown(address: string, timestamp: number) {
  try {
    const cooldowns = loadCooldowns();
    cooldowns[address.toLowerCase()] = timestamp;
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldowns, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist faucet cooldown:", err);
  }
}

export function checkCooldown(address: string): { canClaim: boolean; remainingMs: number; nextEligibleTime: number } {
  const cooldowns = loadCooldowns();
  const lastClaim = cooldowns[address.toLowerCase()] || 0;
  const now = Date.now();
  const elapsed = now - lastClaim;

  if (lastClaim > 0 && elapsed < COOLDOWN_MS) {
    const remainingMs = COOLDOWN_MS - elapsed;
    return { canClaim: false, remainingMs, nextEligibleTime: lastClaim + COOLDOWN_MS };
  }
  return { canClaim: true, remainingMs: 0, nextEligibleTime: 0 };
}

export async function executeDrip(recipient: string): Promise<{ txHash: string; amount: string; nextEligibleTime: number }> {
  if (!isAddress(recipient)) {
    throw new Error("Invalid EVM recipient address.");
  }

  const { canClaim, remainingMs } = checkCooldown(recipient);
  if (!canClaim) {
    const hours = Math.ceil(remainingMs / (1000 * 60 * 60));
    const mins = Math.ceil(remainingMs / (1000 * 60));
    const timeStr = hours > 1 ? `${hours} hours` : `${mins} minutes`;
    throw new Error(`Cooldown active: This address already claimed tUSD8 in the last 24h. Please wait ${timeStr}.`);
  }

  const rawKey = process.env.FAUCET_PRIVATE_KEY || process.env.VOUCH8_FAUCET_PRIVATE_KEY;
  if (!rawKey || rawKey.trim() === "") {
    throw new Error("Faucet wallet not configured on server. Please set FAUCET_PRIVATE_KEY in your .env file.");
  }

  const formattedKey = (rawKey.trim().startsWith("0x") ? rawKey.trim() : `0x${rawKey.trim()}`) as Hex;
  let account;
  try {
    account = privateKeyToAccount(formattedKey);
  } catch (e: any) {
    throw new Error(`Invalid FAUCET_PRIVATE_KEY configured on server: ${e?.message || e}`);
  }

  const rpcUrl = process.env.AEVUM_RPC_URL || "https://rpc-test.qday.info";

  const publicClient = createPublicClient({
    chain: qdayAevum,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: qdayAevum,
    transport: http(rpcUrl),
  });

  // Verify faucet has sufficient tUSD8 balance
  try {
    const faucetBalance = await publicClient.readContract({
      address: TUSD8_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });

    if (faucetBalance < MAX_DRIP_AMOUNT) {
      throw new Error(
        `Faucet wallet (${account.address.slice(0, 6)}...${account.address.slice(-4)}) has insufficient tUSD8 balance (holds ${Number(faucetBalance) / 1e6} tUSD8, needs 10).`
      );
    }
  } catch (err: any) {
    if (err.message && err.message.includes("insufficient tUSD8")) {
      throw err;
    }
    // If read fails (e.g. network glitch), continue to attempt write
    console.warn("Could not pre-check faucet balance:", err?.message);
  }

  const txHash = await walletClient.writeContract({
    address: TUSD8_ADDRESS,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipient as `0x${string}`, MAX_DRIP_AMOUNT],
  });

  const nextEligibleTime = Date.now() + COOLDOWN_MS;
  saveCooldown(recipient, Date.now());

  return { txHash, amount: MAX_DRIP_UNITS, nextEligibleTime };
}

export async function handleFaucetRequest(req: IncomingMessage, res: ServerResponse) {
  // CORS & headers
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);

  // GET: Cooldown check / status
  if (req.method === "GET") {
    const address = url.searchParams.get("address");
    if (!address || !isAddress(address)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Missing or invalid address parameter" }));
      return;
    }
    const status = checkCooldown(address);
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        address,
        canClaim: status.canClaim,
        remainingMs: status.remainingMs,
        nextEligibleTime: status.nextEligibleTime,
        maxDrip: MAX_DRIP_UNITS,
      })
    );
    return;
  }

  // POST: Execute drip
  if (req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const address = body?.address;

      if (!address || !isAddress(address)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid or missing address in request body." }));
        return;
      }

      const result = await executeDrip(address);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err: any) {
      const isCooldown = err?.message?.includes("Cooldown active");
      res.statusCode = isCooldown ? 429 : 500;
      res.end(JSON.stringify({ error: err?.message || "Internal faucet error" }));
    }
    return;
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// Standard serverless default export (for Vercel / Netlify / Node deployments)
export default async function handler(req: any, res: any) {
  return handleFaucetRequest(req, res);
}
