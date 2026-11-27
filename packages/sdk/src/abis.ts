export const TUSD8_ADDRESS = "0x456569838f1d43009A91ebA4263147Afd7233483" as const;

export const DEFAULT_VOUCH8_ADDRESSES = {
  registry: "0x8EA1be949E6FB94f5D0c110D216E06Cdb328D346",
  escrow: "0xDc2dD9C095a9EfB8526A9Afc752398dD79aAd8dA",
  vault: "0x15Bc8eB8e182B4961ace0F0ebDB2f9eB20AaC629",
  tUSD8: TUSD8_ADDRESS,
} as const;

export const QDAY_AEVUM_CHAIN = {
  id: 44005,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-test.qday.info"] },
  },
  blockExplorers: {
    default: { name: "QDay Explorer", url: "https://explorer-test.qday.info" },
  },
} as const;

export const ERC20_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "recipient", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export const VAULT_ABI = [
  { name: "deposit", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "grantSession", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentKey", type: "address" }, { name: "maxPerTask", type: "uint256" }, { name: "dailyLimit", type: "uint256" }, { name: "durationSeconds", type: "uint64" }], outputs: [] },
  { name: "revokeSession", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentKey", type: "address" }], outputs: [] },
  { name: "balances", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "sessions", type: "function", stateMutability: "view", inputs: [{ name: "agentKey", type: "address" }], outputs: [{ name: "owner", type: "address" }, { name: "maxPerTask", type: "uint256" }, { name: "dailyLimit", type: "uint256" }, { name: "spentInWindow", type: "uint256" }, { name: "windowStart", type: "uint64" }, { name: "expiresAt", type: "uint64" }, { name: "revoked", type: "bool" }] },
  // Events
  { name: "Deposited", type: "event", inputs: [{ name: "owner", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { name: "Withdrawn", type: "event", inputs: [{ name: "owner", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { name: "SessionGranted", type: "event", inputs: [{ name: "owner", type: "address", indexed: true }, { name: "agentKey", type: "address", indexed: true }, { name: "maxPerTask", type: "uint256", indexed: false }, { name: "dailyLimit", type: "uint256", indexed: false }, { name: "expiresAt", type: "uint64", indexed: false }] },
  { name: "SessionRevoked", type: "event", inputs: [{ name: "owner", type: "address", indexed: true }, { name: "agentKey", type: "address", indexed: true }] },
] as const;

export const REGISTRY_ABI = [
  { name: "registerAgent", type: "function", stateMutability: "nonpayable", inputs: [{ name: "handle", type: "string" }, { name: "metadataURI", type: "string" }, { name: "payoutWallet", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "isVerifiedAgent", type: "function", stateMutability: "view", inputs: [{ name: "agent", type: "address" }, { name: "minReputation", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "profiles", type: "function", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "agentId", type: "uint256" }, { name: "handle", type: "string" }, { name: "payoutWallet", type: "address" }, { name: "completedTasks", type: "uint256" }, { name: "missedTasks", type: "uint256" }, { name: "reputationScore", type: "uint256" }, { name: "active", type: "bool" }] },
  { name: "getPayoutWallet", type: "function", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ type: "address" }] },
  // Events
  { name: "AgentRegistered", type: "event", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "owner", type: "address", indexed: true }, { name: "handle", type: "string", indexed: false }, { name: "payoutWallet", type: "address", indexed: false }] },
  { name: "ReputationUpdated", type: "event", inputs: [{ name: "agent", type: "address", indexed: true }, { name: "newScore", type: "uint256", indexed: false }, { name: "success", type: "bool", indexed: false }, { name: "taskId", type: "uint256", indexed: false }] },
] as const;

export const ESCROW_ABI = [
  { name: "postTask", type: "function", stateMutability: "nonpayable", inputs: [{ name: "specHash", type: "bytes32" }, { name: "maxBudget", type: "uint256" }, { name: "slaDuration", type: "uint64" }, { name: "minReputation", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "submitBid", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }, { name: "bidAmount", type: "uint256" }], outputs: [] },
  { name: "awardBid", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }, { name: "worker", type: "address" }], outputs: [] },
  { name: "settleTask", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }, { name: "resultHash", type: "bytes32" }], outputs: [] },
  { name: "claimTimeoutRefund", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }], outputs: [] },
  { name: "nextTaskId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "tasks", type: "function", stateMutability: "view", inputs: [{ name: "taskId", type: "uint256" }], outputs: [{ name: "id", type: "uint256" }, { name: "orchestratorKey", type: "address" }, { name: "vaultOwner", type: "address" }, { name: "specHash", type: "bytes32" }, { name: "maxBudget", type: "uint256" }, { name: "slaDuration", type: "uint64" }, { name: "minReputation", type: "uint256" }, { name: "winningWorker", type: "address" }, { name: "lockedAmount", type: "uint256" }, { name: "deadline", type: "uint64" }, { name: "resultHash", type: "bytes32" }, { name: "status", type: "uint8" }] },
  { name: "bids", type: "function", stateMutability: "view", inputs: [{ name: "taskId", type: "uint256" }, { name: "worker", type: "address" }], outputs: [{ type: "uint256" }] },
  // Events
  { name: "TaskPosted", type: "event", inputs: [{ name: "taskId", type: "uint256", indexed: true }, { name: "orchestratorKey", type: "address", indexed: true }, { name: "specHash", type: "bytes32", indexed: false }, { name: "maxBudget", type: "uint256", indexed: false }, { name: "slaDuration", type: "uint64", indexed: false }] },
  { name: "BidSubmitted", type: "event", inputs: [{ name: "taskId", type: "uint256", indexed: true }, { name: "worker", type: "address", indexed: true }, { name: "bidAmount", type: "uint256", indexed: false }] },
  { name: "TaskAwarded", type: "event", inputs: [{ name: "taskId", type: "uint256", indexed: true }, { name: "worker", type: "address", indexed: true }, { name: "lockedAmount", type: "uint256", indexed: false }, { name: "deadline", type: "uint64", indexed: false }] },
  { name: "TaskSettled", type: "event", inputs: [{ name: "taskId", type: "uint256", indexed: true }, { name: "worker", type: "address", indexed: true }, { name: "payoutWallet", type: "address", indexed: false }, { name: "amount", type: "uint256", indexed: false }, { name: "resultHash", type: "bytes32", indexed: false }] },
  { name: "TaskRefunded", type: "event", inputs: [{ name: "taskId", type: "uint256", indexed: true }, { name: "worker", type: "address", indexed: true }, { name: "vaultOwner", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
] as const;
