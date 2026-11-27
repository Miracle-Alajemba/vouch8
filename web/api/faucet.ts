import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  parseEther,
  isAddress,
  type Hex,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Redis } from "@upstash/redis";

// ==============================================================================
// PROTOCOL & CHAIN CONSTANTS
// ==============================================================================
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

export const COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours
export const COOLDOWN_MS = COOLDOWN_SECONDS * 1000;
export const MAX_DRIP_UNITS = "10"; // 10 tUSD8 per claim
export const MAX_DRIP_AMOUNT = parseUnits(MAX_DRIP_UNITS, 6); // 10,000,000 units
export const MAX_IP_CLAIMS_PER_DAY = 3; // Maximum 3 claims per IP per 24 hours
export const MIN_GAS_BALANCE = parseEther("0.001"); // Minimum native tQDAY required for gas

// ==============================================================================
// CUSTOM ERRORS
// ==============================================================================
export class FaucetRefillingError extends Error {
  readonly statusCode = 503;
  constructor(message = "The faucet is currently refilling funds. Please check back shortly.") {
    super(message);
    this.name = "FaucetRefillingError";
  }
}

export class RateLimitError extends Error {
  readonly statusCode = 429;
  readonly remainingMs: number;
  readonly nextEligibleTime?: number;
  constructor(message: string, remainingMs: number, nextEligibleTime?: number) {
    super(message);
    this.name = "RateLimitError";
    this.remainingMs = remainingMs;
    this.nextEligibleTime = nextEligibleTime;
  }
}

// ==============================================================================
// UTILITY HELPERS
// ==============================================================================
function getTodayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function getMsUntilMidnightUtc(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1000, tomorrow.getTime() - now.getTime());
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip = raw.split(",")[0].trim();
    if (ip) return ip;
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    const raw = Array.isArray(realIp) ? realIp[0] : realIp;
    if (raw) return raw.trim();
  }
  return req.socket?.remoteAddress || "127.0.0.1";
}

function getGlobalDailyCap(): number {
  const parsed = parseInt(process.env.FAUCET_DAILY_CAP || "500", 10);
  return isNaN(parsed) || parsed <= 0 ? 500 : parsed;
}

// ==============================================================================
// STORAGE INTERFACE & IMPLEMENTATIONS
// ==============================================================================
interface StorageProvider {
  type: "redis" | "local";
  // Address lock / cooldown
  checkAddressCooldown(address: string): Promise<{ canClaim: boolean; remainingMs: number; nextEligibleTime: number }>;
  acquireAddressLock(address: string): Promise<{ acquired: boolean; remainingMs?: number; nextEligibleTime?: number }>;
  releaseAddressLock(address: string): Promise<void>;
  finalizeAddressClaim(address: string): Promise<void>;

  // IP limit (max 3 claims per 24h)
  checkIpLimit(ip: string): Promise<{ allowed: boolean; remainingMs: number; count: number }>;
  recordIpClaim(ip: string): Promise<void>;

  // Global daily cap (default 500 tUSD8)
  checkGlobalCap(amount: number, cap: number): Promise<{ allowed: boolean; remainingMs: number; currentTotal: number }>;
  recordGlobalClaim(amount: number): Promise<void>;
}

/**
 * Production Redis store using Upstash Redis / Vercel KV
 * Provides atomic SET NX with 24h TTL, IP sliding limits, and global daily cap counters
 */
class RedisStorage implements StorageProvider {
  readonly type = "redis" as const;
  private redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async checkAddressCooldown(address: string) {
    const key = `faucet:addr:${address.toLowerCase()}`;
    const ttl = await this.redis.ttl(key);
    if (ttl > 0) {
      const remainingMs = ttl * 1000;
      return {
        canClaim: false,
        remainingMs,
        nextEligibleTime: Date.now() + remainingMs,
      };
    }
    return { canClaim: true, remainingMs: 0, nextEligibleTime: 0 };
  }

  async acquireAddressLock(address: string) {
    const key = `faucet:addr:${address.toLowerCase()}`;
    // Atomic SET if Not eXists with 24-hour expiration
    const result = await this.redis.set(key, Date.now(), { nx: true, ex: COOLDOWN_SECONDS });
    if (!result) {
      const ttl = await this.redis.ttl(key);
      const remainingMs = Math.max(1000, ttl * 1000);
      return {
        acquired: false,
        remainingMs,
        nextEligibleTime: Date.now() + remainingMs,
      };
    }
    return { acquired: true };
  }

  async releaseAddressLock(address: string) {
    const key = `faucet:addr:${address.toLowerCase()}`;
    await this.redis.del(key);
  }

  async finalizeAddressClaim(address: string) {
    // The key is already atomically set with 24h TTL via acquireAddressLock.
    // Ensure the TTL remains 24h from successful execution:
    const key = `faucet:addr:${address.toLowerCase()}`;
    await this.redis.set(key, Date.now(), { ex: COOLDOWN_SECONDS });
  }

  async checkIpLimit(ip: string) {
    const key = `faucet:ip:${ip}`;
    const count = (await this.redis.get<number>(key)) || 0;
    if (count >= MAX_IP_CLAIMS_PER_DAY) {
      const ttl = await this.redis.ttl(key);
      const remainingMs = Math.max(1000, ttl * 1000);
      return { allowed: false, remainingMs, count };
    }
    return { allowed: true, remainingMs: 0, count };
  }

  async recordIpClaim(ip: string) {
    const key = `faucet:ip:${ip}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, COOLDOWN_SECONDS);
    }
  }

  async checkGlobalCap(amount: number, cap: number) {
    const dateStr = getTodayUtcDateString();
    const key = `faucet:global:${dateStr}`;
    const current = (await this.redis.get<number>(key)) || 0;
    if (current + amount > cap) {
      return {
        allowed: false,
        remainingMs: getMsUntilMidnightUtc(),
        currentTotal: current,
      };
    }
    return { allowed: true, remainingMs: 0, currentTotal: current };
  }

  async recordGlobalClaim(amount: number) {
    const dateStr = getTodayUtcDateString();
    const key = `faucet:global:${dateStr}`;
    const total = await this.redis.incrby(key, amount);
    if (total === amount) {
      await this.redis.expire(key, COOLDOWN_SECONDS * 2); // 48h TTL
    }
  }
}

/**
 * Fallback local file storage for local development
 */
interface LocalStoreSchema {
  cooldowns: Record<string, number>;
  ips: Record<string, { count: number; resetAt: number }>;
  global: Record<string, number>;
}

class LocalFileStorage implements StorageProvider {
  readonly type = "local" as const;
  private filePath: string;
  private inFlightLocks: Set<string> = new Set();

  constructor() {
    this.filePath = path.resolve(process.cwd(), ".faucet-cooldowns.json");
  }

  private load(): LocalStoreSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      }
    } catch {}
    return { cooldowns: {}, ips: {}, global: {} };
  }

  private save(data: LocalStoreSchema) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save local faucet cooldown file:", e);
    }
  }

  async checkAddressCooldown(address: string) {
    const addr = address.toLowerCase();
    const data = this.load();
    const lastClaim = data.cooldowns?.[addr] || 0;
    const now = Date.now();
    const elapsed = now - lastClaim;

    if (this.inFlightLocks.has(addr)) {
      return { canClaim: false, remainingMs: 60000, nextEligibleTime: now + 60000 };
    }

    if (lastClaim > 0 && elapsed < COOLDOWN_MS) {
      const remainingMs = COOLDOWN_MS - elapsed;
      return { canClaim: false, remainingMs, nextEligibleTime: lastClaim + COOLDOWN_MS };
    }
    return { canClaim: true, remainingMs: 0, nextEligibleTime: 0 };
  }

  async acquireAddressLock(address: string) {
    const addr = address.toLowerCase();
    const { canClaim, remainingMs, nextEligibleTime } = await this.checkAddressCooldown(addr);
    if (!canClaim) {
      return { acquired: false, remainingMs, nextEligibleTime };
    }
    if (this.inFlightLocks.has(addr)) {
      return { acquired: false, remainingMs: 60000, nextEligibleTime: Date.now() + 60000 };
    }
    this.inFlightLocks.add(addr);
    return { acquired: true };
  }

  async releaseAddressLock(address: string) {
    this.inFlightLocks.delete(address.toLowerCase());
  }

  async finalizeAddressClaim(address: string) {
    const addr = address.toLowerCase();
    const data = this.load();
    if (!data.cooldowns) data.cooldowns = {};
    data.cooldowns[addr] = Date.now();
    this.save(data);
    this.inFlightLocks.delete(addr);
  }

  async checkIpLimit(ip: string) {
    const data = this.load();
    const entry = data.ips?.[ip];
    const now = Date.now();
    if (entry && now < entry.resetAt) {
      if (entry.count >= MAX_IP_CLAIMS_PER_DAY) {
        return { allowed: false, remainingMs: entry.resetAt - now, count: entry.count };
      }
      return { allowed: true, remainingMs: 0, count: entry.count };
    }
    return { allowed: true, remainingMs: 0, count: 0 };
  }

  async recordIpClaim(ip: string) {
    const data = this.load();
    if (!data.ips) data.ips = {};
    const now = Date.now();
    const entry = data.ips[ip];
    if (entry && now < entry.resetAt) {
      entry.count += 1;
    } else {
      data.ips[ip] = { count: 1, resetAt: now + COOLDOWN_MS };
    }
    this.save(data);
  }

  async checkGlobalCap(amount: number, cap: number) {
    const data = this.load();
    const dateStr = getTodayUtcDateString();
    const current = data.global?.[dateStr] || 0;
    if (current + amount > cap) {
      return {
        allowed: false,
        remainingMs: getMsUntilMidnightUtc(),
        currentTotal: current,
      };
    }
    return { allowed: true, remainingMs: 0, currentTotal: current };
  }

  async recordGlobalClaim(amount: number) {
    const data = this.load();
    if (!data.global) data.global = {};
    const dateStr = getTodayUtcDateString();
    data.global[dateStr] = (data.global[dateStr] || 0) + amount;
    this.save(data);
  }
}

export function getStorage(): StorageProvider {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new RedisStorage(url, token);
  }
  return new LocalFileStorage();
}

// ==============================================================================
// CORE FAUCET DRIP CONTROLLER
// ==============================================================================
export async function executeDrip(
  recipient: string,
  clientIp: string
): Promise<{ txHash: string; amount: string; nextEligibleTime: number }> {
  if (!isAddress(recipient)) {
    throw new Error("Invalid EVM recipient address.");
  }

  const storage = getStorage();
  const dailyCap = getGlobalDailyCap();

  // 1. Check Global Daily Cap
  const globalCheck = await storage.checkGlobalCap(10, dailyCap);
  if (!globalCheck.allowed) {
    const hours = Math.ceil(globalCheck.remainingMs / (1000 * 60 * 60));
    throw new RateLimitError(
      `Global daily faucet cap reached (${dailyCap} tUSD8). The faucet resets daily at 00:00 UTC (in ~${hours}h).`,
      globalCheck.remainingMs
    );
  }

  // 2. Check Per-IP Limit (Max 3 claims per 24 hours)
  const ipCheck = await storage.checkIpLimit(clientIp);
  if (!ipCheck.allowed) {
    const hours = Math.ceil(ipCheck.remainingMs / (1000 * 60 * 60));
    throw new RateLimitError(
      `Daily limit reached for your IP address: maximum 3 claims per 24 hours. Please wait ~${hours}h.`,
      ipCheck.remainingMs
    );
  }

  // 3. Acquire Atomic Lock on Recipient Address (SET NX with 24h TTL)
  const lock = await storage.acquireAddressLock(recipient);
  if (!lock.acquired) {
    const remainingMs = lock.remainingMs || COOLDOWN_MS;
    const hours = Math.ceil(remainingMs / (1000 * 60 * 60));
    const mins = Math.ceil(remainingMs / (1000 * 60));
    const timeStr = hours > 1 ? `${hours} hours` : `${mins} minutes`;
    throw new RateLimitError(
      `Cooldown active: This address already claimed in the last 24 hours. Please wait ${timeStr}.`,
      remainingMs,
      lock.nextEligibleTime
    );
  }

  // Setup Clients
  const rawKey = process.env.FAUCET_PRIVATE_KEY || process.env.VOUCH8_FAUCET_PRIVATE_KEY;
  if (!rawKey || rawKey.trim() === "") {
    await storage.releaseAddressLock(recipient);
    throw new Error("Faucet wallet not configured on server. Please set FAUCET_PRIVATE_KEY in your environment variables.");
  }

  const formattedKey = (rawKey.trim().startsWith("0x") ? rawKey.trim() : `0x${rawKey.trim()}`) as Hex;
  let account;
  try {
    account = privateKeyToAccount(formattedKey);
  } catch (e: unknown) {
    await storage.releaseAddressLock(recipient);
    throw new Error(`Invalid FAUCET_PRIVATE_KEY configured on server: ${e instanceof Error ? e.message : String(e)}`);
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

  // 4. Pre-flight Balance Checks (tUSD8 + native tQDAY)
  try {
    const [tokenBalance, nativeBalance] = await Promise.all([
      publicClient.readContract({
        address: TUSD8_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      }),
      publicClient.getBalance({ address: account.address }),
    ]);

    // Check tUSD8 balance
    if (tokenBalance < MAX_DRIP_AMOUNT) {
      await storage.releaseAddressLock(recipient);
      throw new FaucetRefillingError(
        "The faucet is currently refilling tUSD8 funds. Please check back shortly."
      );
    }

    // Check native tQDAY gas balance
    if (nativeBalance < MIN_GAS_BALANCE) {
      await storage.releaseAddressLock(recipient);
      throw new FaucetRefillingError(
        "The faucet is currently refilling gas fees. Please check back shortly."
      );
    }
  } catch (err) {
    if (err instanceof FaucetRefillingError) {
      throw err;
    }
    console.warn("Pre-flight balance verification warning:", err instanceof Error ? err.message : String(err));
  }

  // 5. Execute On-Chain Transfer
  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      address: TUSD8_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient as `0x${string}`, MAX_DRIP_AMOUNT],
    });
  } catch (err: unknown) {
    // Transfer failed: ALWAYS release the lock so the user is not penalized!
    await storage.releaseAddressLock(recipient);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`On-chain transfer failed: ${msg}`);
  }

  // 6. Finalize Cooldown & Rate Limit Metrics ONLY on Success
  await Promise.all([
    storage.finalizeAddressClaim(recipient),
    storage.recordIpClaim(clientIp),
    storage.recordGlobalClaim(10),
  ]);

  const nextEligibleTime = Date.now() + COOLDOWN_MS;
  return { txHash, amount: MAX_DRIP_UNITS, nextEligibleTime };
}

// ==============================================================================
// HTTP REQUEST HANDLER (Vite Plugin & Serverless Export)
// ==============================================================================
export async function handleFaucetRequest(req: IncomingMessage, res: ServerResponse) {
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
  const clientIp = getClientIp(req);
  const storage = getStorage();

  // GET: Eligibility, Cooldown & Limits Status
  if (req.method === "GET") {
    const address = url.searchParams.get("address");
    if (!address || !isAddress(address)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Missing or invalid address parameter." }));
      return;
    }

    const [addrStatus, ipStatus, globalStatus] = await Promise.all([
      storage.checkAddressCooldown(address),
      storage.checkIpLimit(clientIp),
      storage.checkGlobalCap(10, getGlobalDailyCap()),
    ]);

    const canClaim = addrStatus.canClaim && ipStatus.allowed && globalStatus.allowed;
    const remainingMs = Math.max(addrStatus.remainingMs, ipStatus.remainingMs, globalStatus.remainingMs);

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        address,
        canClaim,
        remainingMs,
        nextEligibleTime: addrStatus.nextEligibleTime || (remainingMs > 0 ? Date.now() + remainingMs : 0),
        maxDrip: MAX_DRIP_UNITS,
        store: storage.type,
        globalCap: getGlobalDailyCap(),
        dailyClaimCount: ipStatus.count,
      })
    );
    return;
  }

  // POST: Execute Drip
  if (req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const address = body?.address;

      if (!address || !isAddress(address)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid or missing address in request body." }));
        return;
      }

      const result = await executeDrip(address, clientIp);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err: unknown) {
      if (err instanceof FaucetRefillingError) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (err instanceof RateLimitError) {
        res.statusCode = 429;
        res.end(
          JSON.stringify({
            error: err.message,
            remainingMs: err.remainingMs,
            nextEligibleTime: err.nextEligibleTime,
          })
        );
        return;
      }

      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Internal faucet error occurred.",
        })
      );
    }
    return;
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: "Method not allowed." }));
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

// Standard serverless default export for Vercel Functions (/api/faucet)
export default async function handler(req: any, res: any) {
  return handleFaucetRequest(req, res);
}
