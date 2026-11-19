"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESCROW_ABI = exports.REGISTRY_ABI = exports.VAULT_ABI = exports.ERC20_ABI = exports.QDAY_AEVUM_CHAIN = exports.TUSD8_ADDRESS = void 0;
exports.TUSD8_ADDRESS = "0x456569838f1d43009A91ebA4263147Afd7233483";
exports.QDAY_AEVUM_CHAIN = {
    id: 44005,
    name: "QDay Aevum Testnet",
    nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
    rpcUrls: {
        default: { http: ["https://rpc-test.qday.info"] },
    },
    blockExplorers: {
        default: { name: "QDay Explorer", url: "https://explorer-test.qday.info" },
    },
};
exports.ERC20_ABI = [
    { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
    { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
    { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];
exports.VAULT_ABI = [
    { name: "deposit", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
    { name: "withdraw", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
    { name: "grantSession", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentKey", type: "address" }, { name: "maxPerTask", type: "uint256" }, { name: "dailyLimit", type: "uint256" }, { name: "durationSeconds", type: "uint64" }], outputs: [] },
    { name: "revokeSession", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentKey", type: "address" }], outputs: [] },
    { name: "balances", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
    { name: "sessions", type: "function", stateMutability: "view", inputs: [{ name: "agentKey", type: "address" }], outputs: [{ name: "owner", type: "address" }, { name: "maxPerTask", type: "uint256" }, { name: "dailyLimit", type: "uint256" }, { name: "spentInWindow", type: "uint256" }, { name: "windowStart", type: "uint64" }, { name: "expiresAt", type: "uint64" }, { name: "revoked", type: "bool" }] },
];
exports.REGISTRY_ABI = [
    { name: "registerAgent", type: "function", stateMutability: "nonpayable", inputs: [{ name: "handle", type: "string" }, { name: "metadataURI", type: "string" }, { name: "payoutWallet", type: "address" }], outputs: [{ type: "uint256" }] },
    { name: "isVerifiedAgent", type: "function", stateMutability: "view", inputs: [{ name: "agent", type: "address" }, { name: "minReputation", type: "uint256" }], outputs: [{ type: "bool" }] },
    { name: "profiles", type: "function", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "agentId", type: "uint256" }, { name: "handle", type: "string" }, { name: "payoutWallet", type: "address" }, { name: "completedTasks", type: "uint256" }, { name: "missedTasks", type: "uint256" }, { name: "reputationScore", type: "uint256" }, { name: "active", type: "bool" }] },
];
exports.ESCROW_ABI = [
    { name: "postTask", type: "function", stateMutability: "nonpayable", inputs: [{ name: "specHash", type: "bytes32" }, { name: "maxBudget", type: "uint256" }, { name: "slaDuration", type: "uint64" }, { name: "minReputation", type: "uint256" }], outputs: [{ type: "uint256" }] },
    { name: "submitBid", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }, { name: "bidAmount", type: "uint256" }], outputs: [] },
    { name: "awardBid", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }, { name: "worker", type: "address" }], outputs: [] },
    { name: "settleTask", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }, { name: "resultHash", type: "bytes32" }], outputs: [] },
    { name: "claimTimeoutRefund", type: "function", stateMutability: "nonpayable", inputs: [{ name: "taskId", type: "uint256" }], outputs: [] },
    { name: "nextTaskId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { name: "tasks", type: "function", stateMutability: "view", inputs: [{ name: "taskId", type: "uint256" }], outputs: [{ name: "id", type: "uint256" }, { name: "orchestratorKey", type: "address" }, { name: "vaultOwner", type: "address" }, { name: "specHash", type: "bytes32" }, { name: "maxBudget", type: "uint256" }, { name: "slaDuration", type: "uint64" }, { name: "minReputation", type: "uint256" }, { name: "winningWorker", type: "address" }, { name: "lockedAmount", type: "uint256" }, { name: "deadline", type: "uint64" }, { name: "resultHash", type: "bytes32" }, { name: "status", type: "uint8" }] },
];
//# sourceMappingURL=abis.js.map