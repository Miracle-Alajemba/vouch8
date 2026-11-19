import { type Address, type WalletClient, type PublicClient } from "viem";
export interface Vouch8Addresses {
    registry: Address;
    escrow: Address;
    vault: Address;
    tUSD8?: Address;
}
export declare class Vouch8Client {
    publicClient: PublicClient;
    walletClient?: WalletClient;
    addresses: Required<Vouch8Addresses>;
    constructor(addresses: Vouch8Addresses, walletClient?: WalletClient);
    static parseTUSD8(amount: string): bigint;
    static formatTUSD8(amount: bigint): string;
    static hashSpec(specText: string): `0x${string}`;
    getVaultBalance(owner: Address): Promise<string>;
    getSessionPolicy(agentKey: Address): Promise<{
        owner: `0x${string}`;
        maxPerTask: string;
        dailyLimit: string;
        spentInWindow: string;
        windowStart: number;
        expiresAt: number;
        revoked: boolean;
    }>;
    getAgentProfile(agent: Address): Promise<{
        agentId: number;
        handle: string;
        payoutWallet: `0x${string}`;
        completedTasks: number;
        missedTasks: number;
        reputationScore: number;
        active: boolean;
    }>;
}
//# sourceMappingURL=client.d.ts.map