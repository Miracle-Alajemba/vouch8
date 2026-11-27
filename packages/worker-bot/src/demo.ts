#!/usr/bin/env node
import { parseUnits } from "viem";
import { Vouch8Client } from "@vouch8/sdk";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { WorkerAgent } from "./worker.js";
import { OrchestratorAgent } from "./orchestrator.js";

async function runDemo() {
  const logger = new Logger("DEMO");
  const config = loadConfig();

  logger.box(
    config.failMode
      ? "VOUCH8 A2A DEMO: SLA TIMEOUT & REFUND SIMULATION (--fail)"
      : "VOUCH8 A2A DEMO: REVERSE-AUCTION ESCROW & SETTLEMENT",
    [
      `Chain:       QDay Aevum Testnet (ID 44005)`,
      `Mode:        ${config.failMode ? "FAILURE / TIMEOUT TEST (--fail)" : "SUCCESS / ON-TIME SETTLEMENT"}`,
      `Registry:    ${config.addresses.registry}`,
      `Escrow:      ${config.addresses.escrow}`,
      `Vault:       ${config.addresses.vault}`,
      `tUSD8:       ${config.addresses.tUSD8}`,
      `AI Engine:   ${config.anthropicApiKey ? "Claude (Anthropic API)" : "Deterministic Attestation Engine"}`,
    ]
  );

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Initialize Agents
    // -------------------------------------------------------------------------
    logger.info("=================================================================");
    logger.info("PHASE 1: INITIALIZING AUTONOMOUS AGENTS");
    logger.info("=================================================================");

    const worker = new WorkerAgent(config);
    await worker.init();

    const orchestrator = new OrchestratorAgent(config);
    await orchestrator.init();

    // -------------------------------------------------------------------------
    // Phase 2: Post Bounty (Orchestrator via Vault Session Key)
    // -------------------------------------------------------------------------
    logger.info("");
    logger.info("=================================================================");
    logger.info("PHASE 2: ORCHESTRATOR POSTS MICRO-BOUNTY");
    logger.info("=================================================================");

    const taskSla = config.failMode ? 15 : 45; // 15 seconds for quick failure test, 45s for normal
    const taskId = await orchestrator.postDemoBounty({
      specText: "https://rpc-test.qday.info - Telemetry, latency, and block production attestation",
      maxBudget: parseUnits("0.50", 6),
      slaDuration: taskSla,
      minReputation: 0n,
    });

    // -------------------------------------------------------------------------
    // Phase 3: Worker Evaluates Bounty & Reverse-Auction Bids
    // -------------------------------------------------------------------------
    logger.info("");
    logger.info("=================================================================");
    logger.info("PHASE 3: WORKER EVALUATES & PLACES REVERSE-AUCTION BID");
    logger.info("=================================================================");

    // Run one polling cycle on worker to discover the new bounty and bid on it
    await worker.pollAndProcess();

    // -------------------------------------------------------------------------
    // Phase 4: Orchestrator Awards Task
    // -------------------------------------------------------------------------
    logger.info("");
    logger.info("=================================================================");
    logger.info("PHASE 4: ORCHESTRATOR AWARDS TASK & LOCKS ESCROW");
    logger.info("=================================================================");

    await orchestrator.waitForBidAndAward(taskId, worker.address, 30000);

    // -------------------------------------------------------------------------
    // Phase 5: Worker Handles Task (Executes or Deliberately Fails)
    // -------------------------------------------------------------------------
    logger.info("");
    logger.info("=================================================================");
    logger.info(
      config.failMode
        ? "PHASE 5: TIMEOUT SIMULATION & 100% REFUND RECOVERY"
        : "PHASE 5: TASK EXECUTION & ON-CHAIN SLA SETTLEMENT"
    );
    logger.info("=================================================================");

    // Run polling on worker again to pick up the Awarded task
    await worker.pollAndProcess();

    // Monitor final state
    await orchestrator.monitorOutcome(taskId, 60000);

    logger.info("");
    logger.info("=================================================================");
    logger.info("DEMO RUN COMPLETE: FULL A2A ESCROW LOOP VERIFIED");
    logger.info("=================================================================");
    process.exit(0);
  } catch (err: unknown) {
    logger.error("Demo run encountered an error:", err);
    process.exit(1);
  }
}

runDemo();
