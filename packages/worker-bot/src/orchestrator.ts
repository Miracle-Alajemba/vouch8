import {
  createWalletClient,
  http,
  keccak256,
  toBytes,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  Vouch8Client,
  QDAY_AEVUM_CHAIN,
  type TaskDetails,
} from "@vouch8/sdk";
import { loadConfig, type WorkerBotConfig } from "./config.js";
import { Logger } from "./logger.js";
import { withRetry } from "./retry.js";

export interface DemoBountyOptions {
  specText?: string;
  maxBudget?: bigint;
  slaDuration?: number; // in seconds
  minReputation?: bigint;
}

export class OrchestratorAgent {
  private config: WorkerBotConfig;
  private logger: Logger;
  private client: Vouch8Client;
  private orchestratorAddress: Address;

  constructor(config: WorkerBotConfig) {
    this.config = config;
    this.logger = new Logger("ORCHESTRATOR");

    // Use orchestrator private key if supplied, or worker key as default
    const privateKey = config.orchestratorPrivateKey || config.workerPrivateKey;
    const account = privateKeyToAccount(privateKey);
    this.orchestratorAddress = account.address;

    const walletClient = createWalletClient({
      account,
      chain: QDAY_AEVUM_CHAIN,
      transport: http(config.rpcUrl),
    });

    this.client = new Vouch8Client(config.addresses, walletClient as any, config.rpcUrl);
  }

  get address(): Address {
    return this.orchestratorAddress;
  }

  async init(): Promise<void> {
    this.logger.info(`Initializing Orchestrator Agent on QDay Aevum (Chain 44005)...`);
    this.logger.info(`Orchestrator Address: ${this.orchestratorAddress}`);

    // Check existing session policy in Vouch8Vault
    let session = await withRetry(() => this.client.getSessionPolicy(this.orchestratorAddress));
    const now = Math.floor(Date.now() / 1000);

    const isSessionValid =
      session.owner !== "0x0000000000000000000000000000000000000000" &&
      !session.revoked &&
      session.expiresAt > now + 300;

    if (!isSessionValid) {
      this.logger.warn(`No active vault session found for orchestrator. Setting up session policy...`);

      // Check vault balance
      const vaultBal = await withRetry(() => this.client.getVaultBalance(this.orchestratorAddress));
      this.logger.info(`Current Vault Balance: ${Vouch8Client.formatTUSD8(vaultBal)} tUSD8`);

      if (vaultBal < parseUnits("0.50", 6)) {
        const walletTusd8 = await withRetry(() => this.client.getTusd8Balance(this.orchestratorAddress));
        this.logger.info(`Wallet tUSD8 Balance: ${Vouch8Client.formatTUSD8(walletTusd8)} tUSD8`);

        if (walletTusd8 >= parseUnits("1.00", 6)) {
          const depositAmount = parseUnits("3.00", 6);
          this.logger.info(`Approving and depositing ${Vouch8Client.formatTUSD8(depositAmount)} tUSD8 into Vouch8Vault...`);

          const approveTx = await withRetry(() =>
            this.client.approveTusd8(this.config.addresses.vault, depositAmount)
          );
          await this.client.waitForTransactionReceipt(approveTx);

          const depTx = await withRetry(() => this.client.depositToVault(depositAmount));
          await this.client.waitForTransactionReceipt(depTx);
          this.logger.success(`Vault deposit confirmed!`, depTx);
        } else {
          this.logger.warn(
            `Orchestrator wallet has low tUSD8 (${Vouch8Client.formatTUSD8(walletTusd8)} tUSD8). Vault will use existing deposited funds.`
          );
        }
      }

      // Grant session key to itself (24 hour session, 1.00 tUSD8 per-task cap, 10.00 tUSD8 daily limit)
      this.logger.info(`Granting 24h session key in Vouch8Vault for ${this.orchestratorAddress}...`);
      const grantTx = await withRetry(() =>
        this.client.grantSession(
          this.orchestratorAddress,
          parseUnits("1.00", 6), // 1.00 tUSD8 per-task cap
          parseUnits("10.00", 6), // 10.00 tUSD8 daily limit
          86400n // 24 hours
        )
      );
      await this.client.waitForTransactionReceipt(grantTx);
      this.logger.success(`Session key granted!`, grantTx);

      session = await withRetry(() => this.client.getSessionPolicy(this.orchestratorAddress));
    }

    this.logger.box("ORCHESTRATOR SESSION ACTIVE", [
      `Session Key:    ${this.orchestratorAddress}`,
      `Vault Owner:    ${session.owner}`,
      `Per-Task Cap:   $${session.maxPerTaskFormatted} tUSD8`,
      `Daily Budget:   $${session.dailyLimitFormatted} tUSD8`,
      `Expires:        in ${Math.max(0, Math.floor((session.expiresAt - now) / 60))} mins`,
    ]);
  }

  async postDemoBounty(options?: DemoBountyOptions): Promise<bigint> {
    const specText =
      options?.specText ||
      "https://rpc-test.qday.info - Attest RPC node latency, block production velocity, and gas price consistency.";
    const specHash = keccak256(toBytes(specText));
    const maxBudget = options?.maxBudget || parseUnits("0.50", 6);
    // In fail simulation mode, use a short SLA (15s) so the demo doesn't wait unnecessarily
    const slaDuration = BigInt(options?.slaDuration || (this.config.failMode ? 15 : 45));
    const minReputation = options?.minReputation || 0n;

    this.logger.info(`Posting new bounty on Vouch8Escrow:`);
    this.logger.info(`Spec Payload:   ${specText}`);
    this.logger.info(`Max Budget:     ${Vouch8Client.formatTUSD8(maxBudget)} tUSD8`);
    this.logger.info(`SLA Duration:   ${slaDuration} seconds`);
    this.logger.info(`Min Reputation: ${minReputation}`);

    const txHash = await withRetry(() =>
      this.client.postTask(specHash, maxBudget, slaDuration, minReputation)
    );
    this.logger.info(`Task posting tx submitted, waiting for confirmation...`);
    await this.client.waitForTransactionReceipt(txHash);

    const nextTaskId = await withRetry(() => this.client.getNextTaskId());
    const taskId = nextTaskId - 1n;

    this.logger.task(taskId, Vouch8Client.formatTUSD8(maxBudget), Number(slaDuration), txHash);
    return taskId;
  }

  async waitForBidAndAward(
    taskId: bigint,
    workerAddress?: Address,
    timeoutMs = 45000
  ): Promise<{ worker: Address; bidAmount: bigint }> {
    this.logger.info(`Waiting for incoming reverse-auction bids on Task #${taskId}...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (workerAddress) {
        const bid = await withRetry(() => this.client.getBid(taskId, workerAddress));
        if (bid > 0n) {
          this.logger.info(
            `Received bid from worker ${workerAddress}: ${Vouch8Client.formatTUSD8(bid)} tUSD8`
          );
          await this.award(taskId, workerAddress);
          return { worker: workerAddress, bidAmount: bid };
        }
      }

      // Check task status directly
      const task = await withRetry(() => this.client.getTask(taskId));
      if (task.status === 1) {
        // Already awarded
        return { worker: task.winningWorker, bidAmount: task.lockedAmount };
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(`Timed out waiting for bids on Task #${taskId}`);
  }

  async award(taskId: bigint, worker: Address): Promise<Hex> {
    this.logger.info(`Awarding Task #${taskId} to worker ${worker}...`);
    const txHash = await withRetry(() => this.client.awardBid(taskId, worker));
    await this.client.waitForTransactionReceipt(txHash);

    const task = await withRetry(() => this.client.getTask(taskId));
    const now = Math.floor(Date.now() / 1000);
    const secondsRemaining = Math.max(0, task.deadline - now);

    this.logger.award(taskId, task.lockedAmountFormatted, secondsRemaining, txHash);
    return txHash;
  }

  async monitorOutcome(taskId: bigint, timeoutMs = 90000): Promise<TaskDetails> {
    this.logger.info(`Monitoring on-chain SLA settlement for Task #${taskId}...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const task = await withRetry(() => this.client.getTask(taskId));

      if (task.status === 2) {
        // Settled
        this.logger.success(
          `Task #${taskId} successfully settled on-time! Output Hash: ${task.resultHash}`
        );
        return task;
      }

      if (task.status === 3) {
        // Refunded
        this.logger.warn(
          `Task #${taskId} SLA missed! 100% of escrow funds refunded back to vault.`
        );
        return task;
      }

      const now = Math.floor(Date.now() / 1000);
      const remaining = task.deadline > now ? task.deadline - now : 0;
      this.logger.info(`Task #${taskId} in progress... Deadline in ${remaining}s`);

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    return await withRetry(() => this.client.getTask(taskId));
  }
}

async function main() {
  const logger = new Logger("ORCHESTRATOR_CLI");
  try {
    const config = loadConfig();
    const orchestrator = new OrchestratorAgent(config);

    await orchestrator.init();
    const taskId = await orchestrator.postDemoBounty();
    logger.info(`Demo bounty #${taskId} posted. Run worker to bid and settle!`);
  } catch (err: unknown) {
    logger.error("Error in orchestrator script:", err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
