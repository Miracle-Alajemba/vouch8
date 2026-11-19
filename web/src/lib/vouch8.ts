import { defineChain } from "viem";

export const qdayAevum = defineChain({
  id: 44005,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-test.qday.info"] },
  },
  blockExplorers: {
    default: { name: "QDay Explorer", url: "https://explorer-test.qday.info" },
  },
});

export const TUSD8_ADDRESS = "0x456569838f1d43009A91ebA4263147Afd7233483" as const;

export const VOUCH8_ADDRESSES = {
  registry: (import.meta.env.VITE_REGISTRY_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  escrow: (import.meta.env.VITE_ESCROW_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  vault: (import.meta.env.VITE_VAULT_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
};

export const ERC20_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const VAULT_ABI = [
  { name: "deposit", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "grantSession", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentKey", type: "address" }, { name: "maxPerTask", type: "uint256" }, { name: "dailyLimit", type: "uint256" }, { name: "durationSeconds", type: "uint64" }], outputs: [] },
  { name: "revokeSession", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentKey", type: "address" }], outputs: [] },
  { name: "balances", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const REGISTRY_ABI = [
  { name: "registerAgent", type: "function", stateMutability: "nonpayable", inputs: [{ name: "handle", type: "string" }, { name: "metadataURI", type: "string" }, { name: "payoutWallet", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "profiles", type: "function", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "agentId", type: "uint256" }, { name: "handle", type: "string" }, { name: "payoutWallet", type: "address" }, { name: "completedTasks", type: "uint256" }, { name: "missedTasks", type: "uint256" }, { name: "reputationScore", type: "uint256" }, { name: "active", type: "bool" }] },
] as const;

export const ESCROW_ABI = [
  { name: "postTask", type: "function", stateMutability: "nonpayable", inputs: [{ name: "specHash", type: "bytes32" }, { name: "maxBudget", type: "uint256" }, { name: "slaDuration", type: "uint64" }, { name: "minReputation", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "submitBid", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }, { name: "bidAmount", type: "uint256" }], outputs: [] },
  { name: "awardBid", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }, { name: "worker", type: "address" }], outputs: [] },
  { name: "settleTask", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }, { name: "resultHash", type: "bytes32" }], outputs: [] },
  { name: "claimTimeoutRefund", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }], outputs: [] },
] as const;
