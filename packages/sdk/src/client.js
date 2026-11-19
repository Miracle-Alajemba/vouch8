"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vouch8Client = void 0;
const viem_1 = require("viem");
const abis_1 = require("./abis");
class Vouch8Client {
    publicClient;
    walletClient;
    addresses;
    constructor(addresses, walletClient) {
        this.addresses = {
            tUSD8: abis_1.TUSD8_ADDRESS,
            ...addresses,
        };
        this.publicClient = (0, viem_1.createPublicClient)({
            chain: abis_1.QDAY_AEVUM_CHAIN,
            transport: (0, viem_1.http)(),
        });
        this.walletClient = walletClient;
    }
    static parseTUSD8(amount) {
        return (0, viem_1.parseUnits)(amount, 6);
    }
    static formatTUSD8(amount) {
        return (0, viem_1.formatUnits)(amount, 6);
    }
    static hashSpec(specText) {
        return (0, viem_1.keccak256)((0, viem_1.toBytes)(specText));
    }
    async getVaultBalance(owner) {
        const bal = await this.publicClient.readContract({
            address: this.addresses.vault,
            abi: abis_1.VAULT_ABI,
            functionName: "balances",
            args: [owner],
        });
        return Vouch8Client.formatTUSD8(bal);
    }
    async getSessionPolicy(agentKey) {
        const [owner, maxPerTask, dailyLimit, spentInWindow, windowStart, expiresAt, revoked] = await this.publicClient.readContract({
            address: this.addresses.vault,
            abi: abis_1.VAULT_ABI,
            functionName: "sessions",
            args: [agentKey],
        });
        return {
            owner,
            maxPerTask: Vouch8Client.formatTUSD8(maxPerTask),
            dailyLimit: Vouch8Client.formatTUSD8(dailyLimit),
            spentInWindow: Vouch8Client.formatTUSD8(spentInWindow),
            windowStart: Number(windowStart),
            expiresAt: Number(expiresAt),
            revoked,
        };
    }
    async getAgentProfile(agent) {
        const [agentId, handle, payoutWallet, completedTasks, missedTasks, reputationScore, active] = await this.publicClient.readContract({
            address: this.addresses.registry,
            abi: abis_1.REGISTRY_ABI,
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
}
exports.Vouch8Client = Vouch8Client;
//# sourceMappingURL=client.js.map