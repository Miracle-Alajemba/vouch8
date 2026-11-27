#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { WorkerAgent } from "./worker.js";
import { Logger } from "./logger.js";

async function main() {
  const logger = new Logger("MAIN");
  try {
    const config = loadConfig();
    const worker = new WorkerAgent(config);

    process.on("SIGINT", () => {
      logger.info("Received SIGINT signal. Stopping worker gracefully...");
      worker.stop();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      logger.info("Received SIGTERM signal. Stopping worker gracefully...");
      worker.stop();
      process.exit(0);
    });

    await worker.init();
    await worker.start();
  } catch (err: unknown) {
    logger.error("Fatal exception in autonomous worker:", err);
    process.exit(1);
  }
}

main();
