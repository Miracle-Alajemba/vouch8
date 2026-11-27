import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  parseUnits,
  formatUnits,
  type Address,
  type WalletClient,
  type PublicClient,
  type Hex,
} from "viem";
import {
  QDAY_AEVUM_CHAIN,
  DEFAULT_VOUCH8_ADDRESSES,
  ERC20_ABI,
  VAULT_ABI,
  REGISTRY_ABI,
  ESCROW_ABI,
} from "./abis";

export interface Vouch8Addresses {
  registry: Address;
  escrow: Address;
  vault: Address;
  tUSD8?: Address;
}

export type TaskStatus = "Open" | "Awarded" | "Settled" | "Refunded";

export interface TaskDetails {
  id: bigint;
  orchestratorKey: Address;
  vaultOwner: Address;
  specHash: Hex;
  maxBudget: bigint;
  maxBudgetFormatted: string;
  slaDuration: number;
  minReputation: bigint;
  winningWorker: Address;
  lockedAmount: bigint;
  lockedAmountFormatted: string;
  deadline: number;
  resultHash: Hex;
  status: number;
  statusLabel: TaskStatus;
}

export class Vouch8Client {
  public publicClient: PublicClient;
  public walletClient?: WalletClient;
  public addresses: Required<Vouch8Addresses>;

  constructor(
    addresses: Partial<Vouch8Addresses> = {},
    walletClient?: WalletClient,
    rpcUrl: string = "https://rpc-test.qday.info"
  ) {
    this.addresses = {
      ...DEFAULT_VOUCH8_ADDRESSES,
      ...addresses,
    } as Required<Vouch8Addresses>;

    this.publicClient = createPublicClient({
      chain: QDAY_AEVUM_CHAIN,
      transport: http(rpcUrl),
    });
    this.walletClient = walletClient;
  }

  // ============================================================================
  // STATIC UTILS
  // ============================================================================
  static parseTUSD8(amount: string): bigint {
    return parseUnits(amount, 6);
  }

  static formatTUSD8(amount: bigint): string {
    return formatUnits(amount, 6);
  }

  static hashSpec(specText: string): Hex {
    return keccak256(toBytes(specText));
  }

  // ============================================================================
  // READ METHODS
  // ============================================================================
  async getTusd8Balance(account: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.addresses.tUSD8,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account],
    });
  }

  async getVaultBalance(owner: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.addresses.vault,
      abi: VAULT_ABI,
      functionName: "balances",
      args: [owner],
    });
  }

  async getSessionPolicy(agentKey: Address) {
    const [owner, maxPerTask, dailyLimit, spentInWindow, windowStart, expiresAt, revoked] =
      await this.publicClient.readContract({
        address: this.addresses.vault,
        abi: VAULT_ABI,
        functionName: "sessions",
        args: [agentKey],
      });
    return {
      owner,
      maxPerTask,
      maxPerTaskFormatted: Vouch8Client.formatTUSD8(maxPerTask),
      dailyLimit,
      dailyLimitFormatted: Vouch8Client.formatTUSD8(dailyLimit),
      spentInWindow,
      spentInWindowFormatted: Vouch8Client.formatTUSD8(spentInWindow),
      windowStart: Number(windowStart),
      expiresAt: Number(expiresAt),
      revoked,
    };
  }

  async getAgentProfile(agent: Address) {
    const [agentId, handle, payoutWallet, completedTasks, missedTasks, reputationScore, active] =
      await this.publicClient.readContract({
        address: this.addresses.registry,
        abi: REGISTRY_ABI,
        functionName: "profiles",
        args: [agent],
      });
    return {
      agentId: Number(agentId),
      handle,
      payoutWallet,
      completedTasks: Number(completedTasks),
      missedTasks: Number(missedTasks),
      reputationScore: Number(reputationScore),
      active,
    };
  }

  async isVerifiedAgent(agent: Address, minReputation: bigint = 0n): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.addresses.registry,
      abi: REGISTRY_ABI,
      functionName: "isVerifiedAgent",
      args: [agent, minReputation],
    });
  }

  async getNextTaskId(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.addresses.escrow,
      abi: ESCROW_ABI,
      functionName: "nextTaskId",
    });
  }

  async getTask(taskId: bigint): Promise<TaskDetails> {
    const raw = await this.publicClient.readContract({
      address: this.addresses.escrow,
      abi: ESCROW_ABI,
      functionName: "tasks",
      args: [taskId],
    });

    const [
      id,
      orchestratorKey,
      vaultOwner,
      specHash,
      maxBudget,
      slaDuration,
      minReputation,
      winningWorker,
      lockedAmount,
      deadline,
      resultHash,
      statusNum,
    ] = raw;

    const statusMap: TaskStatus[] = ["Open", "Awarded", "Settled", "Refunded"];
    const statusLabel = statusMap[statusNum] || "Open";

    return {
      id,
      orchestratorKey,
      vaultOwner,
      specHash,
      maxBudget,
      maxBudgetFormatted: Vouch8Client.formatTUSD8(maxBudget),
      slaDuration: Number(slaDuration),
      minReputation,
      winningWorker,
      lockedAmount,
      lockedAmountFormatted: Vouch8Client.formatTUSD8(lockedAmount),
      deadline: Number(deadline),
      resultHash,
      status: statusNum,
      statusLabel,
    };
  }

  async getBid(taskId: bigint, worker: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.addresses.escrow,
      abi: ESCROW_ABI,
      functionName: "bids",
      args: [taskId, worker],
    });
  }

  async getOpenTasks(limit: number = 20): Promise<TaskDetails[]> {
    const nextId = await this.getNextTaskId();
    const openTasks: TaskDetails[] = [];
    if (nextId <= 1n) return openTasks;

    const startId = nextId - 1n;
    const lowestId = startId > BigInt(limit) ? startId - BigInt(limit) + 1n : 1n;

    for (let id = startId; id >= lowestId; id--) {
      try {
        const task = await this.getTask(id);
        if (task.status === 0) {
          openTasks.push(task);
        }
      } catch {
        // Skip uninitialized or failed task reads
      }
    }
    return openTasks;
  }

  // ============================================================================
  // WRITE METHODS (WalletClient Required)
  // ============================================================================
  private ensureWalletClient(): WalletClient {
    if (!this.walletClient || !this.walletClient.account) {
      throw new Error("WalletClient with account is required to execute write operations.");
    }
    return this.walletClient;
  }

  async registerAgent(handle: string, metadataURI: string = "", payoutWallet?: Address): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    const payout = payoutWallet || wallet.account!.address;
    return await wallet.writeContract({
      address: this.addresses.registry,
      abi: REGISTRY_ABI,
      functionName: "registerAgent",
      args: [handle, metadataURI, payout],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async postTask(
    specHash: Hex,
    maxBudget: bigint,
    slaDuration: bigint,
    minReputation: bigint = 0n
  ): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.escrow,
      abi: ESCROW_ABI,
      functionName: "postTask",
      args: [specHash, maxBudget, slaDuration, minReputation],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async submitBid(taskId: bigint, bidAmount: bigint): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.escrow,
      abi: ESCROW_ABI,
      functionName: "submitBid",
      args: [taskId, bidAmount],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async awardBid(taskId: bigint, worker: Address): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.escrow,
      abi: ESCROW_ABI,
      functionName: "awardBid",
      args: [taskId, worker],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async settleTask(taskId: bigint, resultHash: Hex): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.escrow,
      abi: ESCROW_ABI,
      functionName: "settleTask",
      args: [taskId, resultHash],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async claimTimeoutRefund(taskId: bigint): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.escrow,
      abi: ESCROW_ABI,
      functionName: "claimTimeoutRefund",
      args: [taskId],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async approveTusd8(spender: Address, amount: bigint): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.tUSD8,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async depositToVault(amount: bigint): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.vault,
      abi: VAULT_ABI,
      functionName: "deposit",
      args: [amount],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async withdrawFromVault(amount: bigint): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.vault,
      abi: VAULT_ABI,
      functionName: "withdraw",
      args: [amount],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async grantSession(
    agentKey: Address,
    maxPerTask: bigint,
    dailyLimit: bigint,
    durationSeconds: bigint
  ): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.vault,
      abi: VAULT_ABI,
      functionName: "grantSession",
      args: [agentKey, maxPerTask, dailyLimit, durationSeconds],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async revokeSession(agentKey: Address): Promise<Hex> {
    const wallet = this.ensureWalletClient();
    return await wallet.writeContract({
      address: this.addresses.vault,
      abi: VAULT_ABI,
      functionName: "revokeSession",
      args: [agentKey],
      chain: QDAY_AEVUM_CHAIN,
      account: wallet.account!,
    });
  }

  async waitForTransactionReceipt(hash: Hex) {
    return await this.publicClient.waitForTransactionReceipt({ hash });
  }
}
