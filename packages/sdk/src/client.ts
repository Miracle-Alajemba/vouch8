import { createPublicClient, createWalletClient, http, keccak256, toBytes, parseUnits, formatUnits, type Address, type WalletClient, type PublicClient } from "viem";
import { QDAY_AEVUM_CHAIN, TUSD8_ADDRESS, ERC20_ABI, VAULT_ABI, REGISTRY_ABI, ESCROW_ABI } from "./abis";

export interface Vouch8Addresses {
  registry: Address;
  escrow: Address;
  vault: Address;
  tUSD8?: Address;
}

export class Vouch8Client {
  public publicClient: PublicClient;
  public walletClient?: WalletClient;
  public addresses: Required<Vouch8Addresses>;

  constructor(addresses: Vouch8Addresses, walletClient?: WalletClient) {
    this.addresses = {
      tUSD8: TUSD8_ADDRESS,
      ...addresses,
    };
    this.publicClient = createPublicClient({
      chain: QDAY_AEVUM_CHAIN,
      transport: http(),
    });
    this.walletClient = walletClient;
  }

  static parseTUSD8(amount: string): bigint {
    return parseUnits(amount, 6);
  }

  static formatTUSD8(amount: bigint): string {
    return formatUnits(amount, 6);
  }

  static hashSpec(specText: string): `0x${string}` {
    return keccak256(toBytes(specText));
  }

  async getVaultBalance(owner: Address): Promise<string> {
    const bal = await this.publicClient.readContract({
      address: this.addresses.vault,
      abi: VAULT_ABI,
      functionName: "balances",
      args: [owner],
    });
    return Vouch8Client.formatTUSD8(bal);
  }

  async getSessionPolicy(agentKey: Address) {
    const [owner, maxPerTask, dailyLimit, spentInWindow, windowStart, expiresAt, revoked] =
      await this.publicClient.readContract({
        address: this.addresses.vault,
        abi: VAULT_ABI,
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

  async getAgentProfile(agent: Address) {
    const [agentId, handle, payoutWallet, completedTasks, missedTasks, reputationScore, active] =
      await this.publicClient.readContract({
        address: this.addresses.registry,
        abi: REGISTRY_ABI,
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
