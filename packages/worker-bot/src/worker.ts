import {
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  Vouch8Client,
  QDAY_AEVUM_CHAIN,
  type TaskDetails,
} from "@vouch8/sdk";
import { type WorkerBotConfig } from "./config.js";
import { Logger } from "./logger.js";
import { withRetry } from "./retry.js";
import { DefaultTaskExecutor, type TaskExecutor } from "./executor.js";

export class WorkerAgent {
  private config: WorkerBotConfig;
  private logger: Logger;
  private client: Vouch8Client;
  private workerAddress: Address;
  private executor: TaskExecutor;

  private running = false;
  private bidsThisHour = 0;
  private hourWindowStart = Date.now();
  private processedTaskBids = new Set<string>();
  private settledTasks = new Set<string>();

  constructor(config: WorkerBotConfig, executor?: TaskExecutor) {
    this.config = config;
    this.logger = new Logger("WORKER");

    const account = privateKeyToAccount(config.workerPrivateKey);
    this.workerAddress = account.address;

    const walletClient = createWalletClient({
      account,
      chain: QDAY_AEVUM_CHAIN,
      transport: http(config.rpcUrl),
    });

    this.client = new Vouch8Client(config.addresses, walletClient as any, config.rpcUrl);
    this.executor = executor || new DefaultTaskExecutor(config.anthropicApiKey);
  }

  get address(): Address {
    return this.workerAddress;
  }

  async init(): Promise<void> {
    this.logger.info(`Initializing Autonomous Worker on QDay Aevum (Chain 44005)...`);
    this.logger.info(`Worker Address: ${this.workerAddress}`);

    // Check V8ID in Registry
    let profile = await withRetry(() => this.client.getAgentProfile(this.workerAddress));

    if (!profile.active) {
      const handle = `worker-${this.workerAddress.slice(2, 8).toLowerCase()}`;
      this.logger.warn(`No active ERC-8004 identity found. Minting V8ID: @${handle}...`);

      const txHash = await withRetry(() =>
        this.client.registerAgent(handle, "ipfs://vouch8-autonomous-worker-v1", this.workerAddress)
      );
      this.logger.info(`Mint transaction submitted, waiting for confirmation...`);
      await this.client.waitForTransactionReceipt(txHash);

      profile = await withRetry(() => this.client.getAgentProfile(this.workerAddress));
      this.logger.success(`V8ID Passport Minted: @${profile.handle} (ID: ${profile.agentId})`, txHash);
    } else {
      this.logger.info(`V8ID Active: @${profile.handle} (ID: ${profile.agentId})`);
    }

    this.logger.reputation(profile.reputationScore, profile.reputationScore, "INITIAL READOUT");

    this.logger.box("AUTONOMOUS WORKER INITIALIZED", [
      `Handle:              @${profile.handle}`,
      `Reputation:          ${profile.reputationScore} / 1000`,
      `Min Bid Price:       ${this.config.minPriceFormatted} tUSD8`,
      `Undercut Discount:   ${this.config.undercutPercent}%`,
      `Max Bids/Hour:       ${this.config.maxBidsPerHour}`,
      `Mode:                ${this.config.failMode ? "FAIL_SIMULATION (--fail)" : "NORMAL (On-Time Settlement)"}`,
    ]);
  }

  async start(): Promise<void> {
    this.running = true;
    this.logger.info(`Starting task polling loop (every ${this.config.pollIntervalMs}ms)...`);

    while (this.running) {
      try {
        await this.pollAndProcess();
      } catch (err: unknown) {
        this.logger.error("Error during polling iteration (retrying next cycle):", err);
      }

      await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
    }
  }

  stop(): void {
    this.running = false;
    this.logger.info("Worker stopped.");
  }

  async pollAndProcess(): Promise<void> {
    // Reset hourly rate limit window
    if (Date.now() - this.hourWindowStart > 3600000) {
      this.bidsThisHour = 0;
      this.hourWindowStart = Date.now();
    }

    const openTasks = await withRetry(() => this.client.getOpenTasks(15));

    for (const task of openTasks) {
      await this.evaluateAndBid(task);
    }

    // Also check for awarded tasks belonging to this worker
    const nextTaskId = await withRetry(() => this.client.getNextTaskId());
    const latestId = nextTaskId - 1n;
    const inspectStart = latestId > 10n ? latestId - 10n : 1n;

    for (let id = latestId; id >= inspectStart; id--) {
      try {
        const task = await withRetry(() => this.client.getTask(id));
        if (
          task.status === 1 && // Awarded
          task.winningWorker.toLowerCase() === this.workerAddress.toLowerCase() &&
          !this.settledTasks.has(task.id.toString())
        ) {
          await this.handleAwardedTask(task);
        }
      } catch {
        // Skip
      }
    }
  }

  private async evaluateAndBid(task: TaskDetails): Promise<void> {
    const taskIdStr = task.id.toString();

    // Skip if already bid
    if (this.processedTaskBids.has(taskIdStr)) {
      return;
    }

    const existingBid = await withRetry(() => this.client.getBid(task.id, this.workerAddress));
    if (existingBid > 0n) {
      this.processedTaskBids.add(taskIdStr);
      return;
    }

    // 1. Budget check
    if (task.maxBudget < this.config.minPrice) {
      this.logger.warn(`Task #${task.id}: budget (${task.maxBudgetFormatted} tUSD8) is below MIN_PRICE. Skipping.`);
      this.processedTaskBids.add(taskIdStr);
      return;
    }

    // 2. SLA Duration check
    if (task.slaDuration < 10) {
      this.logger.warn(`Task #${task.id}: SLA duration (${task.slaDuration}s) too short. Skipping.`);
      this.processedTaskBids.add(taskIdStr);
      return;
    }

    // 3. Hourly bid rate limit check
    if (this.bidsThisHour >= this.config.maxBidsPerHour) {
      this.logger.warn(`Hourly bid limit reached (${this.config.maxBidsPerHour}/h). Skipping Task #${task.id}.`);
      return;
    }

    // Calculate reverse-auction bid (undercutting max budget by X%)
    const discountFactor = BigInt(100 - this.config.undercutPercent);
    let bidAmount = (task.maxBudget * discountFactor) / 100n;
    if (bidAmount < this.config.minPrice) {
      bidAmount = this.config.minPrice;
    }

    const bidFormatted = Vouch8Client.formatTUSD8(bidAmount);
    this.logger.info(`Task #${task.id}: Evaluated bounty. Max: $${task.maxBudgetFormatted} · Placing bid: $${bidFormatted}...`);

    try {
      const txHash = await withRetry(
        () => this.client.submitBid(task.id, bidAmount),
        {
          onRetry: (err: unknown, attempt: number) => this.logger.warn(`Retry #${attempt} submitting bid for Task #${task.id}: ${err}`),
        }
      );
      this.processedTaskBids.add(taskIdStr);
      this.bidsThisHour++;
      this.logger.bid(task.id, bidFormatted, txHash);
    } catch (err: unknown) {
      this.logger.error(`Failed to submit bid on Task #${task.id}:`, err);
    }
  }

  private async handleAwardedTask(task: TaskDetails): Promise<void> {
    const taskIdStr = task.id.toString();
    this.settledTasks.add(taskIdStr);

    const now = Math.floor(Date.now() / 1000);
    const secondsRemaining = Math.max(0, task.deadline - now);

    this.logger.award(task.id, task.lockedAmountFormatted, secondsRemaining);

    // Profile before outcome
    const profileBefore = await withRetry(() => this.client.getAgentProfile(this.workerAddress));

    // =========================================================================
    // FAILURE DEMONSTRATION MODE (--fail flag)
    // =========================================================================
    if (this.config.failMode) {
      this.logger.warn(
        `[--fail FLAG ACTIVE] Deliberately delaying task execution to miss SLA deadline (${task.deadline})...`
      );

      // Wait until after the deadline has expired
      const waitTimeSec = secondsRemaining + 2;
      this.logger.info(`Waiting ${waitTimeSec} seconds for deadline to expire...`);
      await new Promise((resolve) => setTimeout(resolve, waitTimeSec * 1000));

      this.logger.warn(`Deadline expired! Calling claimTimeoutRefund(#${task.id}) to trigger SLA penalty...`);
      try {
        const refundTxHash = await withRetry(() => this.client.claimTimeoutRefund(task.id));
        await this.client.waitForTransactionReceipt(refundTxHash);
        this.logger.refund(task.id, task.lockedAmountFormatted, refundTxHash);

        // Check slashed reputation
        const profileAfter = await withRetry(() => this.client.getAgentProfile(this.workerAddress));
        this.logger.reputation(profileBefore.reputationScore, profileAfter.reputationScore, "SLA DEADLINE BREACH (-30)");
      } catch (err: unknown) {
        this.logger.error(`Failed to claim timeout refund:`, err);
      }
      return;
    }

    // =========================================================================
    // NORMAL EXECUTION MODE (On-Time Settlement)
    // =========================================================================
    this.logger.exec(task.id, `Executing payload via pluggable executor...`);
    const { output, resultHash, usedAi } = await this.executor.execute(
      task.id,
      "https://rpc-test.qday.info (QDay Aevum Testnet Block Telemetry)"
    );

    this.logger.exec(
      task.id,
      `Execution complete (${usedAi ? "Claude AI" : "Deterministic Attestation"}). Result hash: ${resultHash}`
    );

    try {
      this.logger.info(`Submitting delivery proof (settleTask) on-chain...`);
      const settleTxHash = await withRetry(
        () => this.client.settleTask(task.id, resultHash),
        {
          onRetry: (err: unknown, attempt: number) => this.logger.warn(`Retry #${attempt} settling Task #${task.id}: ${err}`),
        }
      );
      await this.client.waitForTransactionReceipt(settleTxHash);

      this.logger.settle(task.id, task.lockedAmountFormatted, resultHash, settleTxHash);

      // Check updated reputation (+15)
      const profileAfter = await withRetry(() => this.client.getAgentProfile(this.workerAddress));
      this.logger.reputation(profileBefore.reputationScore, profileAfter.reputationScore, "SLA COMPLETED (+15)");
    } catch (err: unknown) {
      this.logger.error(`Settlement transaction failed for Task #${task.id}:`, err);
    }
  }
}
