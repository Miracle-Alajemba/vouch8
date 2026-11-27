import pc from "picocolors";

export class Logger {
  private prefix: string;

  constructor(prefix: string = "WORKER") {
    this.prefix = prefix;
  }

  private time(): string {
    return pc.dim(`[${new Date().toLocaleTimeString()}]`);
  }

  info(message: string) {
    console.log(`${this.time()} ${pc.cyan(`[${this.prefix}]`)} ${message}`);
  }

  success(message: string, txHash?: string) {
    console.log(
      `${this.time()} ${pc.green(`[SUCCESS]`)} ${message}${
        txHash ? `\n       ${pc.dim("↳ Tx:")} ${pc.underline(pc.cyan(`https://explorer-test.qday.info/tx/${txHash}`))}` : ""
      }`
    );
  }

  bid(taskId: bigint | number, amountFormatted: string, txHash?: string) {
    console.log(
      `${this.time()} ${pc.magenta(`[BID]`)} Task #${taskId} ← Submitted bid of ${pc.bold(amountFormatted)} tUSD8${
        txHash ? ` (${pc.underline(pc.cyan(`https://explorer-test.qday.info/tx/${txHash}`))})` : ""
      }`
    );
  }

  task(taskId: bigint | number, maxBudgetFormatted: string, slaDuration: number, txHash?: string) {
    console.log(
      `${this.time()} ${pc.blue(`[TASK POSTED]`)} Task #${taskId} open for reverse auction!\n` +
        `       ${pc.dim("↳ Max Budget:")} ${pc.bold(maxBudgetFormatted)} tUSD8\n` +
        `       ${pc.dim("↳ SLA Duration:")} ${slaDuration}s\n` +
        `       ${pc.dim("↳ Tx:")} ${txHash ? pc.underline(pc.cyan(`https://explorer-test.qday.info/tx/${txHash}`)) : ""}`
    );
  }

  award(taskId: bigint | number, lockedAmountFormatted: string, deadlineSec: number, txHash?: string) {
    console.log(
      `${this.time()} ${pc.yellow(`[AWARDED]`)} Task #${taskId} awarded! Locked: ${pc.bold(
        lockedAmountFormatted
      )} tUSD8 · SLA Deadline in ${deadlineSec}s${
        txHash ? `\n       ${pc.dim("↳ Tx:")} ${pc.underline(pc.cyan(`https://explorer-test.qday.info/tx/${txHash}`))}` : ""
      }`
    );
  }

  exec(taskId: bigint | number, action: string) {
    console.log(`${this.time()} ${pc.blue(`[EXECUTOR]`)} Task #${taskId}: ${action}`);
  }

  settle(taskId: bigint | number, payoutFormatted: string, resultHash: string, txHash: string) {
    console.log(
      `${this.time()} ${pc.green(`[SETTLED]`)} Task #${taskId} completed on-time!\n` +
        `       ${pc.dim("↳ Payout:")} ${pc.bold(payoutFormatted)} tUSD8\n` +
        `       ${pc.dim("↳ Result Hash:")} ${pc.dim(resultHash)}\n` +
        `       ${pc.dim("↳ Tx:")} ${pc.underline(pc.cyan(`https://explorer-test.qday.info/tx/${txHash}`))}`
    );
  }

  refund(taskId: bigint | number, amountFormatted: string, txHash?: string) {
    console.log(
      `${this.time()} ${pc.red(`[TIMEOUT REFUND]`)} Task #${taskId} SLA missed! 100% refunded (${amountFormatted} tUSD8) to vault.${
        txHash ? `\n       ${pc.dim("↳ Tx:")} ${pc.underline(pc.cyan(`https://explorer-test.qday.info/tx/${txHash}`))}` : ""
      }`
    );
  }

  reputation(before: number, after: number, reason: string) {
    const diff = after - before;
    const diffFormatted = diff > 0 ? pc.green(`+${diff}`) : diff < 0 ? pc.red(`${diff}`) : pc.dim(`0`);
    console.log(
      `${this.time()} ${pc.yellow(`[REPUTATION]`)} Score: ${before} → ${pc.bold(after)} (${diffFormatted}) [${reason}]`
    );
  }

  warn(message: string) {
    console.log(`${this.time()} ${pc.yellow(`[WARN]`)} ${message}`);
  }

  error(message: string, error?: unknown) {
    console.error(
      `${this.time()} ${pc.red(`[ERROR]`)} ${message}`,
      error instanceof Error ? pc.dim(error.message) : error || ""
    );
  }

  box(title: string, lines: string[]) {
    console.log(pc.cyan("━".repeat(60)));
    console.log(pc.bold(pc.white(` ${title}`)));
    console.log(pc.cyan("─".repeat(60)));
    for (const line of lines) {
      console.log(` ${line}`);
    }
    console.log(pc.cyan("━".repeat(60)));
  }
}

export const logger = new Logger("WORKER");
