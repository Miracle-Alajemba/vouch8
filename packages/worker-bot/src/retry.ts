export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 4,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
  onRetry: () => {},
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;
  let delay = config.initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Distinguish permanent business reverts from transient network/nonce errors
      const isTransient =
        errorMessage.includes("nonce") ||
        errorMessage.includes("replacement fee") ||
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("429") ||
        errorMessage.includes("502") ||
        errorMessage.includes("503") ||
        errorMessage.includes("timeout");

      if (attempt >= config.maxRetries || !isTransient) {
        throw err;
      }

      config.onRetry(err, attempt);

      // Add small jitter
      const jitter = Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      delay = Math.min(delay * config.backoffFactor, config.maxDelayMs);
    }
  }
}
