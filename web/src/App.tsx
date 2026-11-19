import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useReadContract, useWriteContract, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { parseUnits, formatUnits, keccak256, toBytes } from "viem";
import { qdayAevum, TUSD8_ADDRESS, VOUCH8_ADDRESSES, ERC20_ABI, VAULT_ABI, REGISTRY_ABI, ESCROW_ABI } from "./lib/vouch8";

export default function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();

  const [depositAmt, setDepositAmt] = useState("2.0");
  const [agentKey, setAgentKey] = useState("");
  const [maxPerTask, setMaxPerTask] = useState("0.5");
  const [dailyLimit, setDailyLimit] = useState("2.0");
  const [agentHandle, setAgentHandle] = useState("alpha-research-v1");
  const [taskSpec, setTaskSpec] = useState("Verify live QDay Aevum block metrics & summarize");
  const [maxBudget, setMaxBudget] = useState("0.4");
  const [slaSeconds, setSlaSeconds] = useState("60");
  const [taskIdInput, setTaskIdInput] = useState("1");
  const [bidAmt, setBidAmt] = useState("0.25");
  const [resultText, setResultText] = useState("verified-payload-hash-001");
  const [txLog, setTxLog] = useState<string[]>([]);

  const log = (msg: string) => setTxLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const { data: walletTusd8, refetch: refetchWallet } = useReadContract({
    address: TUSD8_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: vaultBal, refetch: refetchVault } = useReadContract({
    address: VOUCH8_ADDRESSES.vault,
    abi: VAULT_ABI,
    functionName: "balances",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: profile, refetch: refetchProfile } = useReadContract({
    address: VOUCH8_ADDRESSES.registry,
    abi: REGISTRY_ABI,
    functionName: "profiles",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const handleDeposit = async () => {
    try {
      const units = parseUnits(depositAmt, 6);
      log(`Approving ${depositAmt} tUSD8 for Vouch8Vault...`);
      await writeContractAsync({ address: TUSD8_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [VOUCH8_ADDRESSES.vault, units] });
      log(`Depositing ${depositAmt} tUSD8 into Vouch8Vault...`);
      const hash = await writeContractAsync({ address: VOUCH8_ADDRESSES.vault, abi: VAULT_ABI, functionName: "deposit", args: [units] });
      log(`Deposited! Tx: ${hash}`);
      refetchWallet();
      refetchVault();
    } catch (e: unknown) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleGrantSession = async () => {
    try {
      const targetKey = (agentKey || address) as `0x${string}`;
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.vault,
        abi: VAULT_ABI,
        functionName: "grantSession",
        args: [targetKey, parseUnits(maxPerTask, 6), parseUnits(dailyLimit, 6), BigInt(86400)],
      });
      log(`Session key ${targetKey.slice(0, 10)}... authorized! Tx: ${hash}`);
    } catch (e: unknown) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRevokeSession = async () => {
    try {
      const targetKey = (agentKey || address) as `0x${string}`;
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.vault,
        abi: VAULT_ABI,
        functionName: "revokeSession",
        args: [targetKey],
      });
      log(`KILL-SWITCH TRIGGERED: Revoked session ${targetKey.slice(0, 10)}...! Tx: ${hash}`);
    } catch (e: unknown) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRegisterAgent = async () => {
    try {
      if (!address) return;
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.registry,
        abi: REGISTRY_ABI,
        functionName: "registerAgent",
        args: [agentHandle, `ipfs://vouch8/${agentHandle}`, address],
      });
      log(`ERC-8004 Identity minted for @${agentHandle}! Tx: ${hash}`);
      refetchProfile();
    } catch (e: unknown) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handlePostTask = async () => {
    try {
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "postTask",
        args: [keccak256(toBytes(taskSpec)), parseUnits(maxBudget, 6), BigInt(slaSeconds), BigInt(100)],
      });
      log(`Micro-bounty posted to Vouch8Escrow! Tx: ${hash}`);
    } catch (e: unknown) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleBidAndAward = async () => {
    try {
      if (!address) return;
      const id = BigInt(taskIdInput);
      log(`Submitting reverse-auction bid of ${bidAmt} tUSD8 on Task #${taskIdInput}...`);
      await writeContractAsync({ address: VOUCH8_ADDRESSES.escrow, abi: ESCROW_ABI, functionName: "submitBid", args: [id, parseUnits(bidAmt, 6)] });
      log(`Awarding Task #${taskIdInput} & locking ${bidAmt} tUSD8 in SLA escrow...`);
      const hash = await writeContractAsync({ address: VOUCH8_ADDRESSES.escrow, abi: ESCROW_ABI, functionName: "awardBid", args: [id, address] });
      log(`Task #${taskIdInput} awarded & tUSD8 locked! Tx: ${hash}`);
      refetchVault();
    } catch (e: unknown) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleSettle = async () => {
    try {
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "settleTask",
        args: [BigInt(taskIdInput), keccak256(toBytes(resultText))],
      });
      log(`SLA met! Task #${taskIdInput} settled & tUSD8 released! Tx: ${hash}`);
      refetchWallet();
      refetchProfile();
    } catch (e: unknown) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRefund = async () => {
    try {
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "claimTimeoutRefund",
        args: [BigInt(taskIdInput)],
      });
      log(`SLA missed! 100% tUSD8 refunded to vault! Tx: ${hash}`);
      refetchVault();
      refetchProfile();
    } catch (e: unknown) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                QDay Aevum Testnet • Chain ID 44005
              </span>
              <span className="rounded-lg bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-400 ring-1 ring-cyan-500/30">
                ERC-8004 + tUSD8
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Vouch8 Protocol</h1>
            <p className="text-sm text-slate-400">Scoped Agent Vaults, ERC-8004 Confirmation of Payee & SLA-Enforced Reverse Auctions</p>
          </div>

          <div className="flex items-center gap-3">
            {isConnected && chainId !== qdayAevum.id && (
              <button onClick={() => switchChain({ chainId: qdayAevum.id })} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">
                Switch to QDay Aevum
              </button>
            )}
            {!isConnected ? (
              <button onClick={() => connect({ connector: injected() })} className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
                Connect MetaMask
              </button>
            ) : (
              <button onClick={() => disconnect()} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
                {address?.slice(0, 6)}...{address?.slice(-4)} (Disconnect)
              </button>
            )}
          </div>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">Wallet tUSD8 Balance</p>
            <p className="mt-1 text-2xl font-bold text-white">{walletTusd8 !== undefined ? formatUnits(walletTusd8, 6) : "0.00"} tUSD8</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">Vouch8Vault Locked Budget</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{vaultBal !== undefined ? formatUnits(vaultBal, 6) : "0.00"} tUSD8</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">ERC-8004 Reputation Score</p>
            <p className="mt-1 text-2xl font-bold text-cyan-400">{profile && profile[6] ? `${profile[5].toString()} / 1000 (@${profile[1]})` : "Unregistered"}</p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold text-white">1. Scoped Agent Vault & Kill-Switch</h2>
            <p className="mb-4 text-xs text-slate-400">Deposit tUSD8 and enforce per-task caps, 24h limits, and instant revocation.</p>

            <div className="mb-5 flex gap-2">
              <input value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} placeholder="Amount tUSD8" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              <button disabled={isPending} onClick={handleDeposit} className="whitespace-nowrap rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                Deposit tUSD8
              </button>
            </div>

            <div className="space-y-3 border-t border-slate-800 pt-4">
              <input value={agentKey} onChange={(e) => setAgentKey(e.target.value)} placeholder="Agent Session Address (leave blank to use connected wallet)" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              <div className="grid grid-cols-2 gap-2">
                <input value={maxPerTask} onChange={(e) => setMaxPerTask(e.target.value)} placeholder="Max Per Task (tUSD8)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                <input value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="Daily Limit (tUSD8)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              </div>
              <div className="flex gap-2">
                <button disabled={isPending} onClick={handleGrantSession} className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
                  Authorize Session Key
                </button>
                <button disabled={isPending} onClick={handleRevokeSession} className="w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">
                  1-Click Revoke
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold text-white">2. ERC-8004 Identity & SLA Reverse Auction</h2>
            <p className="mb-4 text-xs text-slate-400">Register verified agent NFTs, post micro-bounties, and test SLA settlement vs. timeout refunds.</p>

            <div className="mb-5 flex gap-2">
              <input value={agentHandle} onChange={(e) => setAgentHandle(e.target.value)} placeholder="Agent Handle" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              <button disabled={isPending} onClick={handleRegisterAgent} className="whitespace-nowrap rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
                Mint ERC-8004 ID
              </button>
            </div>

            <div className="space-y-3 border-t border-slate-800 pt-4">
              <input value={taskSpec} onChange={(e) => setTaskSpec(e.target.value)} placeholder="Task Specification" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              <div className="grid grid-cols-2 gap-2">
                <input value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} placeholder="Max Budget (tUSD8)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                <input value={slaSeconds} onChange={(e) => setSlaSeconds(e.target.value)} placeholder="SLA Window (seconds)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              </div>
              <button disabled={isPending} onClick={handlePostTask} className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                Post Micro-Bounty Task
              </button>
            </div>

            <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
              <div className="grid grid-cols-3 gap-2">
                <input value={taskIdInput} onChange={(e) => setTaskIdInput(e.target.value)} placeholder="Task ID" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                <input value={bidAmt} onChange={(e) => setBidAmt(e.target.value)} placeholder="Bid (tUSD8)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                <button disabled={isPending} onClick={handleBidAndAward} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
                  Bid & Lock
                </button>
              </div>
              <input value={resultText} onChange={(e) => setResultText(e.target.value)} placeholder="Delivery Result Proof" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              <div className="flex gap-2">
                <button disabled={isPending} onClick={handleSettle} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                  Settle SLA (Pay Worker)
                </button>
                <button disabled={isPending} onClick={handleRefund} className="w-full rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
                  Claim Timeout Refund
                </button>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Live On-Chain Activity Feed</h3>
          <div className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-slate-300">
            {txLog.length === 0 ? <p className="text-slate-500">Connect MetaMask on QDay Aevum Testnet (Chain ID 44005) to run live transactions.</p> : txLog.map((entry, idx) => <p key={idx}>{entry}</p>)}
          </div>
        </section>
      </main>
    </div>
  );
}
