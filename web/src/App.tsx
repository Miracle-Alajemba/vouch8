import { useState, useEffect, useMemo } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useSwitchChain,
  useBalance,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { parseUnits, formatUnits, keccak256, toBytes, isAddress } from "viem";
import {
  qdayAevum,
  TUSD8_ADDRESS,
  VOUCH8_ADDRESSES,
  ERC20_ABI,
  VAULT_ABI,
  REGISTRY_ABI,
  ESCROW_ABI,
} from "./lib/vouch8";

interface TxLogEntry {
  id: string;
  time: string;
  status: "SUCCESS" | "PENDING" | "ERROR";
  message: string;
  txHash?: string;
}

export default function App() {
  // Theme state persisted in localStorage
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vouch8_theme");
      if (saved === "light" || saved === "dark") return saved;
      if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    }
    return "dark";
  });

  useEffect(() => {
    localStorage.setItem("vouch8_theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Wagmi hooks
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();

  // Native gas balance (tQDAY)
  const { data: gasBalance } = useBalance({
    address,
    chainId: qdayAevum.id,
  });

  // State inputs
  const [activeTreasuryTab, setActiveTreasuryTab] = useState<"deposit" | "withdraw">("deposit");
  const [depositAmt, setDepositAmt] = useState("2.0");
  const [withdrawAmt, setWithdrawAmt] = useState("1.0");

  const [agentKey, setAgentKey] = useState("");
  const [maxPerTask, setMaxPerTask] = useState("0.5");
  const [dailyLimit, setDailyLimit] = useState("2.0");
  const [sessionDurationDays, setSessionDurationDays] = useState("1");

  const [agentHandle, setAgentHandle] = useState("alpha-research-v1");
  const [payoutWalletInput, setPayoutWalletInput] = useState("");

  const [taskSpec, setTaskSpec] = useState("Verify live QDay Aevum block metrics & summarize");
  const [maxBudget, setMaxBudget] = useState("0.4");
  const [slaSeconds, setSlaSeconds] = useState("60");

  const [taskIdInput, setTaskIdInput] = useState("1");
  const [bidAmt, setBidAmt] = useState("0.25");
  const [resultText, setResultText] = useState("verified-payload-hash-001");

  // Activity Log
  const [txLog, setTxLog] = useState<TxLogEntry[]>([
    {
      id: "init",
      time: new Date().toLocaleTimeString(),
      status: "SUCCESS",
      message: "Vouch8 Command Center initialized on QDay Aevum Testnet (Chain ID 44005).",
    },
  ]);

  const addLog = (status: "SUCCESS" | "PENDING" | "ERROR", message: string, txHash?: string) => {
    setTxLog((prev) => [
      {
        id: Math.random().toString(36).substring(2, 9),
        time: new Date().toLocaleTimeString(),
        status,
        message,
        txHash,
      },
      ...prev,
    ]);
  };

  const clearLog = () => setTxLog([]);

  // On-chain reads
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

  // Effective session query key
  const effectiveAgentKey = useMemo(() => {
    if (agentKey && isAddress(agentKey)) return agentKey as `0x${string}`;
    if (address) return address;
    return undefined;
  }, [agentKey, address]);

  const { data: sessionPolicy, refetch: refetchSession } = useReadContract({
    address: VOUCH8_ADDRESSES.vault,
    abi: VAULT_ABI,
    functionName: "sessions",
    args: effectiveAgentKey ? [effectiveAgentKey] : undefined,
    query: { enabled: !!effectiveAgentKey },
  });

  // Live Task Inspector query
  const parsedTaskId = useMemo(() => {
    const val = parseInt(taskIdInput, 10);
    return isNaN(val) || val <= 0 ? 1n : BigInt(val);
  }, [taskIdInput]);

  const { data: inspectedTask, refetch: refetchTask } = useReadContract({
    address: VOUCH8_ADDRESSES.escrow,
    abi: ESCROW_ABI,
    functionName: "tasks",
    args: [parsedTaskId],
    query: { enabled: !!address },
  });

  // Live countdown timer for SLA deadline
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!inspectedTask || inspectedTask[11] !== 1) {
      setSecondsRemaining(null);
      return;
    }
    const deadlineNum = Number(inspectedTask[9]);
    if (deadlineNum <= 0) {
      setSecondsRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = deadlineNum - now;
      setSecondsRemaining(diff > 0 ? diff : 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [inspectedTask]);

  // Stepper calculations
  const isStage1Complete = (vaultBal ?? 0n) > 0n;
  const isStage2Complete =
    !!sessionPolicy &&
    sessionPolicy[0] !== "0x0000000000000000000000000000000000000000" &&
    !sessionPolicy[6];
  const isStage3Complete = !!profile && profile[6] === true;
  const isStage4Complete = inspectedTask ? inspectedTask[11] === 2 : false;

  // Handlers
  const handleDeposit = async () => {
    try {
      if (!address) return;
      const units = parseUnits(depositAmt, 6);
      addLog("PENDING", `Approving ${depositAmt} tUSD8 for Vouch8Vault...`);
      await writeContractAsync({
        address: TUSD8_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [VOUCH8_ADDRESSES.vault, units],
      });
      addLog("PENDING", `Depositing ${depositAmt} tUSD8 into Vouch8Vault...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.vault,
        abi: VAULT_ABI,
        functionName: "deposit",
        args: [units],
      });
      addLog("SUCCESS", `Successfully deposited ${depositAmt} tUSD8 into Vault!`, hash);
      refetchWallet();
      refetchVault();
    } catch (e: unknown) {
      addLog("ERROR", `Deposit failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleWithdraw = async () => {
    try {
      if (!address) return;
      const units = parseUnits(withdrawAmt, 6);
      addLog("PENDING", `Withdrawing ${withdrawAmt} tUSD8 from Vouch8Vault...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.vault,
        abi: VAULT_ABI,
        functionName: "withdraw",
        args: [units],
      });
      addLog("SUCCESS", `Withdrew ${withdrawAmt} tUSD8 back to liquid wallet!`, hash);
      refetchWallet();
      refetchVault();
    } catch (e: unknown) {
      addLog("ERROR", `Withdraw failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleGrantSession = async () => {
    try {
      if (!address) return;
      const targetKey = (agentKey && isAddress(agentKey) ? agentKey : address) as `0x${string}`;
      const durationSeconds = BigInt(Math.max(1, parseInt(sessionDurationDays, 10)) * 86400);

      addLog("PENDING", `Authorizing session policy for ${targetKey.slice(0, 8)}...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.vault,
        abi: VAULT_ABI,
        functionName: "grantSession",
        args: [
          targetKey,
          parseUnits(maxPerTask, 6),
          parseUnits(dailyLimit, 6),
          durationSeconds,
        ],
      });
      addLog(
        "SUCCESS",
        `Session key scoped! Max/task: $${maxPerTask}, Daily limit: $${dailyLimit}`,
        hash
      );
      refetchSession();
    } catch (e: unknown) {
      addLog("ERROR", `Session grant failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRevokeSession = async () => {
    try {
      if (!address) return;
      const targetKey = (agentKey && isAddress(agentKey) ? agentKey : address) as `0x${string}`;
      addLog("PENDING", `KILL-SWITCH: Revoking session key ${targetKey.slice(0, 8)}...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.vault,
        abi: VAULT_ABI,
        functionName: "revokeSession",
        args: [targetKey],
      });
      addLog("SUCCESS", `EMERGENCY REVOCATION CONFIRMED: Session key disabled on-chain!`, hash);
      refetchSession();
    } catch (e: unknown) {
      addLog("ERROR", `Session revocation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRegisterAgent = async () => {
    try {
      if (!address) return;
      const payout = payoutWalletInput && isAddress(payoutWalletInput) ? payoutWalletInput : address;
      addLog("PENDING", `Minting ERC-8004 Identity for @${agentHandle}...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.registry,
        abi: REGISTRY_ABI,
        functionName: "registerAgent",
        args: [agentHandle, `ipfs://vouch8/${agentHandle}`, payout],
      });
      addLog("SUCCESS", `ERC-8004 Identity minted for @${agentHandle}!`, hash);
      refetchProfile();
    } catch (e: unknown) {
      addLog("ERROR", `Agent registration failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handlePostTask = async () => {
    try {
      if (!address) return;
      addLog("PENDING", `Posting micro-bounty to Vouch8Escrow...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "postTask",
        args: [
          keccak256(toBytes(taskSpec)),
          parseUnits(maxBudget, 6),
          BigInt(slaSeconds),
          BigInt(100),
        ],
      });
      addLog("SUCCESS", `Task posted to reverse-auction escrow! Budget: ${maxBudget} tUSD8`, hash);
      refetchVault();
      refetchTask();
    } catch (e: unknown) {
      addLog("ERROR", `Task creation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleBidAndAward = async () => {
    try {
      if (!address) return;
      const id = parsedTaskId;
      addLog("PENDING", `Submitting reverse-auction bid of ${bidAmt} tUSD8 on Task #${id}...`);
      await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "submitBid",
        args: [id, parseUnits(bidAmt, 6)],
      });
      addLog("PENDING", `Awarding Task #${id} & locking ${bidAmt} tUSD8 in SLA escrow...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "awardBid",
        args: [id, address],
      });
      addLog("SUCCESS", `Task #${id} awarded & budget locked in escrow!`, hash);
      refetchVault();
      refetchTask();
    } catch (e: unknown) {
      addLog("ERROR", `Bid/Award failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleSettle = async () => {
    try {
      if (!address) return;
      const id = parsedTaskId;
      addLog("PENDING", `Settling Task #${id} with delivery result proof...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "settleTask",
        args: [id, keccak256(toBytes(resultText))],
      });
      addLog("SUCCESS", `SLA satisfied! Task #${id} settled & worker rewarded!`, hash);
      refetchWallet();
      refetchProfile();
      refetchTask();
    } catch (e: unknown) {
      addLog("ERROR", `Settlement failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRefund = async () => {
    try {
      if (!address) return;
      const id = parsedTaskId;
      addLog("PENDING", `Claiming timeout refund on Task #${id}...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "claimTimeoutRefund",
        args: [id],
      });
      addLog("SUCCESS", `SLA breach confirmed! 100% refund credited back to Vault!`, hash);
      refetchVault();
      refetchProfile();
      refetchTask();
    } catch (e: unknown) {
      addLog("ERROR", `Refund claim failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Helper formatting
  const taskStatusMap: Record<number, { label: string; badge: string }> = {
    0: {
      label: "Open (Bidding)",
      badge:
        theme === "dark"
          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
          : "bg-amber-50 text-amber-700 border-amber-200",
    },
    1: {
      label: "Awarded (SLA Active)",
      badge:
        theme === "dark"
          ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
          : "bg-cyan-50 text-cyan-700 border-cyan-200",
    },
    2: {
      label: "Settled (SLA Met)",
      badge:
        theme === "dark"
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          : "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    3: {
      label: "Refunded (SLA Missed)",
      badge:
        theme === "dark"
          ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
          : "bg-rose-50 text-rose-700 border-rose-200",
    },
  };

  const repScore = profile && profile[6] ? Number(profile[5]) : 0;
  const completedCount = profile && profile[6] ? Number(profile[3]) : 0;
  const missedCount = profile && profile[6] ? Number(profile[4]) : 0;

  // Theme-aware styles
  const isDark = theme === "dark";
  const pageBg = isDark ? "bg-[#020617] text-slate-100" : "bg-[#F8FAFC] text-slate-900";
  const navBg = isDark
    ? "bg-[#020617]/85 border-slate-800/80 backdrop-blur-md"
    : "bg-white/85 border-slate-200 backdrop-blur-md";
  const cardBg = isDark
    ? "bg-[#0F172A]/80 border-slate-800 shadow-xl shadow-black/20"
    : "bg-white border-slate-200 shadow-sm shadow-slate-200/50";
  const inputBg = isDark
    ? "bg-[#020617] border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500"
    : "bg-[#F8FAFC] border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600";
  const subtext = isDark ? "text-slate-400" : "text-slate-500";
  const borderCol = isDark ? "border-slate-800" : "border-slate-200";

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${pageBg}`}>
      {/* Top Navigation & Status Bar */}
      <header className={`sticky top-0 z-50 border-b px-4 py-3 sm:px-8 ${navBg}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          {/* Brand Mark */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 p-0.5 shadow-lg shadow-cyan-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950 font-black tracking-tighter text-cyan-400">
                V8
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight">Vouch8</span>
                <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-500 ring-1 ring-cyan-500/20">
                  Command Center
                </span>
              </div>
              <p className={`hidden text-xs sm:block ${subtext}`}>
                Autonomous Agent Micro-Escrow & ERC-8004 Settlement
              </p>
            </div>
          </div>

          {/* Center Links & Status */}
          <div className="hidden items-center gap-2 md:flex">
            {/* Live Network Status */}
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                isDark
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span>QDay Aevum • 44005</span>
            </div>

            {/* Contract Quick Explorer Links */}
            <div className={`flex items-center gap-1 border-l pl-2 ${borderCol}`}>
              <a
                href={`https://explorer-test.qday.info/address/${VOUCH8_ADDRESSES.vault}`}
                target="_blank"
                rel="noreferrer"
                className={`rounded px-2 py-1 text-xs transition-colors hover:text-cyan-500 ${subtext}`}
                title="View Vouch8Vault Contract"
              >
                Vault ↗
              </a>
              <a
                href={`https://explorer-test.qday.info/address/${VOUCH8_ADDRESSES.registry}`}
                target="_blank"
                rel="noreferrer"
                className={`rounded px-2 py-1 text-xs transition-colors hover:text-cyan-500 ${subtext}`}
                title="View Vouch8ERC8004Registry Contract"
              >
                Registry ↗
              </a>
              <a
                href={`https://explorer-test.qday.info/address/${VOUCH8_ADDRESSES.escrow}`}
                target="_blank"
                rel="noreferrer"
                className={`rounded px-2 py-1 text-xs transition-colors hover:text-cyan-500 ${subtext}`}
                title="View Vouch8Escrow Contract"
              >
                Escrow ↗
              </a>
            </div>
          </div>

          {/* Right Controls: Theme Toggle & Wallet */}
          <div className="flex items-center gap-2.5">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle Theme"
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900"
              }`}
            >
              {isDark ? (
                <>
                  <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                  <span>Light</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                  </svg>
                  <span>Dark</span>
                </>
              )}
            </button>

            {/* Network Mismatch Switcher */}
            {isConnected && chainId !== qdayAevum.id && (
              <button
                onClick={() => switchChain({ chainId: qdayAevum.id })}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-md transition hover:bg-amber-400"
              >
                Switch Network
              </button>
            )}

            {/* Wallet Connect / Badge */}
            {!isConnected ? (
              <button
                onClick={() => connect({ connector: injected() })}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Connect MetaMask
              </button>
            ) : (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                  isDark ? "border-slate-700 bg-slate-900/90" : "border-slate-300 bg-white"
                }`}
              >
                <div className="flex flex-col text-right">
                  <span className="font-mono font-semibold">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                  <span className={`text-[10px] ${subtext}`}>
                    {gasBalance ? `${parseFloat(formatUnits(gasBalance.value, gasBalance.decimals)).toFixed(3)} ${gasBalance.symbol}` : "0 tQDAY"}
                  </span>
                </div>
                <button
                  onClick={() => disconnect()}
                  className={`rounded p-1 transition hover:text-rose-500 ${subtext}`}
                  title="Disconnect Wallet"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        {/* 4-Card Protocol Telemetry Strip */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Wallet Liquid tUSD8 */}
          <div className={`rounded-2xl border p-5 transition-all ${cardBg}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wider ${subtext}`}>Liquid Capital</span>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                Wallet
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black tracking-tight">
                {walletTusd8 !== undefined ? parseFloat(formatUnits(walletTusd8, 6)).toFixed(2) : "0.00"}
              </span>
              <span className="ml-1.5 text-xs font-medium text-emerald-500">tUSD8</span>
            </div>
            <p className={`mt-1 text-xs ${subtext}`}>Available for vault funding & bids</p>
          </div>

          {/* Card 2: Vault Locked Budget */}
          <div className={`rounded-2xl border p-5 transition-all ${cardBg}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wider ${subtext}`}>Vouch8Vault</span>
              <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-500">
                Guardrailed
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black tracking-tight text-cyan-500">
                {vaultBal !== undefined ? parseFloat(formatUnits(vaultBal, 6)).toFixed(2) : "0.00"}
              </span>
              <span className="ml-1.5 text-xs font-medium text-cyan-500">tUSD8</span>
            </div>
            <p className={`mt-1 text-xs ${subtext}`}>Secured against prompt runaway spend</p>
          </div>

          {/* Card 3: ERC-8004 Reputation Gauge */}
          <div className={`rounded-2xl border p-5 transition-all ${cardBg}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wider ${subtext}`}>ERC-8004 Passport</span>
              {profile && profile[6] ? (
                <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-500">
                  @{profile[1]}
                </span>
              ) : (
                <span className="rounded-md bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  Unregistered
                </span>
              )}
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-black tracking-tight text-indigo-500">{repScore}</span>
                <span className={`ml-1 text-xs ${subtext}`}>/ 1000</span>
              </div>
              <span className="text-xs font-semibold text-emerald-500">
                {completedCount} ✓ / {missedCount} ✗
              </span>
            </div>
            {/* Visual Gauge Bar */}
            <div className={`mt-2 h-2 w-full overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(5, (repScore / 1000) * 100))}%` }}
              ></div>
            </div>
          </div>

          {/* Card 4: Active Session Policy Status */}
          <div className={`rounded-2xl border p-5 transition-all ${cardBg}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wider ${subtext}`}>Session Policy</span>
              {sessionPolicy && sessionPolicy[0] !== "0x0000000000000000000000000000000000000000" ? (
                sessionPolicy[6] ? (
                  <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-500">
                    Revoked
                  </span>
                ) : (
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                    Active
                  </span>
                )
              ) : (
                <span className="rounded-md bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  No Policy
                </span>
              )}
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className={subtext}>Max/Task:</span>
                <span className="font-mono font-semibold">
                  {sessionPolicy && sessionPolicy[0] !== "0x0000000000000000000000000000000000000000"
                    ? `$${formatUnits(sessionPolicy[1], 6)}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={subtext}>Daily Cap:</span>
                <span className="font-mono font-semibold">
                  {sessionPolicy && sessionPolicy[0] !== "0x0000000000000000000000000000000000000000"
                    ? `$${formatUnits(sessionPolicy[2], 6)}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={subtext}>Spent 24h:</span>
                <span className="font-mono font-semibold text-amber-500">
                  {sessionPolicy && sessionPolicy[0] !== "0x0000000000000000000000000000000000000000"
                    ? `$${formatUnits(sessionPolicy[3], 6)}`
                    : "$0.00"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Guided 4-Stage Workflow Stepper */}
        <section className={`mb-8 rounded-2xl border p-5 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-500">
              Agent Economic Coordination Workflow
            </h2>
            <span className={`text-xs ${subtext}`}>State verified on QDay Aevum</span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div
              className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                isStage1Complete
                  ? isDark
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : isDark
                  ? "border-slate-800 bg-slate-900/40 opacity-75"
                  : "border-slate-200 bg-slate-50 opacity-75"
              }`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  isStage1Complete ? "bg-emerald-500 text-slate-950" : isDark ? "bg-slate-800" : "bg-slate-200"
                }`}
              >
                {isStage1Complete ? "✓" : "1"}
              </div>
              <div>
                <p className="text-xs font-bold">1. Fund Vault</p>
                <p className={`text-[11px] ${subtext}`}>Deposit tUSD8</p>
              </div>
            </div>

            {/* Step 2 */}
            <div
              className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                isStage2Complete
                  ? isDark
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : isDark
                  ? "border-slate-800 bg-slate-900/40 opacity-75"
                  : "border-slate-200 bg-slate-50 opacity-75"
              }`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  isStage2Complete ? "bg-emerald-500 text-slate-950" : isDark ? "bg-slate-800" : "bg-slate-200"
                }`}
              >
                {isStage2Complete ? "✓" : "2"}
              </div>
              <div>
                <p className="text-xs font-bold">2. Scope Session</p>
                <p className={`text-[11px] ${subtext}`}>Delegate caps & limits</p>
              </div>
            </div>

            {/* Step 3 */}
            <div
              className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                isStage3Complete
                  ? isDark
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : isDark
                  ? "border-slate-800 bg-slate-900/40 opacity-75"
                  : "border-slate-200 bg-slate-50 opacity-75"
              }`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  isStage3Complete ? "bg-emerald-500 text-slate-950" : isDark ? "bg-slate-800" : "bg-slate-200"
                }`}
              >
                {isStage3Complete ? "✓" : "3"}
              </div>
              <div>
                <p className="text-xs font-bold">3. Mint ERC-8004</p>
                <p className={`text-[11px] ${subtext}`}>Agent Passport NFT</p>
              </div>
            </div>

            {/* Step 4 */}
            <div
              className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                isStage4Complete
                  ? isDark
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : isDark
                  ? "border-slate-800 bg-slate-900/40 opacity-75"
                  : "border-slate-200 bg-slate-50 opacity-75"
              }`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  isStage4Complete ? "bg-emerald-500 text-slate-950" : isDark ? "bg-slate-800" : "bg-slate-200"
                }`}
              >
                {isStage4Complete ? "✓" : "4"}
              </div>
              <div>
                <p className="text-xs font-bold">4. SLA Settlement</p>
                <p className={`text-[11px] ${subtext}`}>Bid, lock & pay</p>
              </div>
            </div>
          </div>
        </section>

        {/* Two-Column Command Center Workspace */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* ================= LEFT COLUMN: TREASURY & KILL-SWITCH ================= */}
          <div className="space-y-6">
            {/* Card 1: tUSD8 Treasury (Deposit & Withdraw) */}
            <div className={`rounded-2xl border p-6 ${cardBg}`}>
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-base font-bold">tUSD8 Vault Treasury</h3>
                  <p className={`text-xs ${subtext}`}>Fund or withdraw autonomous agent operating budget</p>
                </div>
                {/* Deposit / Withdraw Tabs */}
                <div className={`flex rounded-lg border p-0.5 ${borderCol} ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                  <button
                    onClick={() => setActiveTreasuryTab("deposit")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                      activeTreasuryTab === "deposit"
                        ? "bg-emerald-500 text-slate-950 shadow"
                        : `${subtext} hover:text-white`
                    }`}
                  >
                    Deposit
                  </button>
                  <button
                    onClick={() => setActiveTreasuryTab("withdraw")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                      activeTreasuryTab === "withdraw"
                        ? "bg-cyan-500 text-slate-950 shadow"
                        : `${subtext} hover:text-white`
                    }`}
                  >
                    Withdraw
                  </button>
                </div>
              </div>

              {activeTreasuryTab === "deposit" ? (
                <div className="mt-5 space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className={subtext}>Amount to lock in Vouch8Vault</span>
                    <span className="font-mono">
                      Wallet: {walletTusd8 !== undefined ? parseFloat(formatUnits(walletTusd8, 6)).toFixed(2) : "0.00"} tUSD8
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={depositAmt}
                      onChange={(e) => setDepositAmt(e.target.value)}
                      placeholder="Amount tUSD8"
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium outline-none transition ${inputBg}`}
                    />
                    <button
                      disabled={isPending || !isConnected}
                      onClick={handleDeposit}
                      className="whitespace-nowrap rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {isPending ? "Processing..." : "Approve & Deposit"}
                    </button>
                  </div>
                  {/* Preset Pills */}
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${subtext}`}>Quick:</span>
                    {["1.0", "2.0", "5.0", "10.0"].map((val) => (
                      <button
                        key={val}
                        onClick={() => setDepositAmt(val)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-mono font-medium transition hover:border-emerald-500 ${borderCol} ${
                          isDark ? "bg-slate-950 hover:bg-slate-900" : "bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        +{val}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className={subtext}>Amount to return to wallet</span>
                    <span className="font-mono text-cyan-500">
                      Vault: {vaultBal !== undefined ? parseFloat(formatUnits(vaultBal, 6)).toFixed(2) : "0.00"} tUSD8
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={withdrawAmt}
                      onChange={(e) => setWithdrawAmt(e.target.value)}
                      placeholder="Amount tUSD8"
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium outline-none transition ${inputBg}`}
                    />
                    <button
                      disabled={isPending || !isConnected}
                      onClick={handleWithdraw}
                      className="whitespace-nowrap rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md shadow-cyan-500/20 transition hover:bg-cyan-400 disabled:opacity-50"
                    >
                      {isPending ? "Processing..." : "Withdraw"}
                    </button>
                  </div>
                  {/* Quick Max */}
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${subtext}`}>Quick:</span>
                    <button
                      onClick={() => setWithdrawAmt(vaultBal ? formatUnits(vaultBal, 6) : "0")}
                      className={`rounded-md border px-2.5 py-1 text-xs font-mono font-medium transition hover:border-cyan-500 ${borderCol} ${
                        isDark ? "bg-slate-950 hover:bg-slate-900" : "bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      MAX Vault
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Card 2: Session Policy & Scoped Delegation */}
            <div className={`rounded-2xl border p-6 ${cardBg}`}>
              <div className="border-b pb-4">
                <h3 className="text-base font-bold">Autonomous Session Delegation</h3>
                <p className={`text-xs ${subtext}`}>
                  Issue cryptographic spending policies to agent orchestrator keys
                </p>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className={`block text-xs font-semibold ${subtext} mb-1.5`}>
                    Delegated Agent Public Key (Address)
                  </label>
                  <input
                    value={agentKey}
                    onChange={(e) => setAgentKey(e.target.value)}
                    placeholder="Leave blank to use connected wallet address"
                    className={`w-full rounded-xl border px-4 py-2.5 font-mono text-sm outline-none transition ${inputBg}`}
                  />
                </div>

                {/* Preset Limit Pills */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className={`text-xs font-semibold ${subtext}`}>Spend Guardrail Presets</label>
                    <span className={`text-[11px] ${subtext}`}>Max Task / Daily Cap</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { per: "0.5", daily: "2.0", label: "$0.50 / $2.00" },
                      { per: "1.0", daily: "5.0", label: "$1.00 / $5.00" },
                      { per: "2.5", daily: "10.0", label: "$2.50 / $10.00" },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setMaxPerTask(preset.per);
                          setDailyLimit(preset.daily);
                        }}
                        className={`rounded-xl border p-2 text-center text-xs font-mono font-semibold transition hover:border-cyan-500 ${borderCol} ${
                          isDark ? "bg-slate-950 hover:bg-slate-900" : "bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-semibold ${subtext} mb-1.5`}>
                      Max Per Task (tUSD8)
                    </label>
                    <input
                      value={maxPerTask}
                      onChange={(e) => setMaxPerTask(e.target.value)}
                      placeholder="0.5"
                      className={`w-full rounded-xl border px-4 py-2 font-mono text-sm outline-none transition ${inputBg}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold ${subtext} mb-1.5`}>
                      24h Daily Limit (tUSD8)
                    </label>
                    <input
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(e.target.value)}
                      placeholder="2.0"
                      className={`w-full rounded-xl border px-4 py-2 font-mono text-sm outline-none transition ${inputBg}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-semibold ${subtext} mb-1.5`}>Policy Duration</label>
                  <select
                    value={sessionDurationDays}
                    onChange={(e) => setSessionDurationDays(e.target.value)}
                    className={`w-full rounded-xl border px-4 py-2 text-sm outline-none transition ${inputBg}`}
                  >
                    <option value="1">1 Day (24 Hours)</option>
                    <option value="7">7 Days (Standard Sprint)</option>
                    <option value="30">30 Days (Production Agent)</option>
                  </select>
                </div>

                <button
                  disabled={isPending || !isConnected}
                  onClick={handleGrantSession}
                  className="w-full rounded-xl bg-cyan-500 py-3 text-sm font-bold text-slate-950 shadow-md shadow-cyan-500/20 transition hover:bg-cyan-400 disabled:opacity-50"
                >
                  {isPending ? "Authorizing On-Chain..." : "Authorize Session Policy"}
                </button>
              </div>
            </div>

            {/* High-Visibility Emergency Kill-Switch Banner */}
            <div
              className={`rounded-2xl border p-5 transition-all ${
                isDark
                  ? "border-rose-900/60 bg-gradient-to-br from-rose-950/40 to-slate-950 shadow-lg shadow-rose-950/20"
                  : "border-rose-300 bg-rose-50/70 shadow-sm"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600/20 text-rose-500 ring-1 ring-rose-500/30">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-rose-500">Emergency Kill-Switch (1-Click Revoke)</h4>
                  <p className={`mt-1 text-xs ${subtext}`}>
                    Instantly freezes the target session key on-chain. Prevents runaway agent loops, malicious prompt
                    injections, and uncommitted task settlement.
                  </p>
                  <button
                    disabled={isPending || !isConnected}
                    onClick={handleRevokeSession}
                    className="mt-3.5 w-full rounded-xl bg-rose-600 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-rose-600/30 transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {isPending ? "Revoking..." : "Trigger Emergency Revocation"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: IDENTITY & SLA REVERSE-AUCTION ================= */}
          <div className="space-y-6">
            {/* Card 3: ERC-8004 Identity Passport */}
            <div className={`rounded-2xl border p-6 ${cardBg}`}>
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-base font-bold">ERC-8004 Agent Passport</h3>
                  <p className={`text-xs ${subtext}`}>Verifiable Confirmation of Payee & on-chain reputation</p>
                </div>
                {profile && profile[6] && (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500 ring-1 ring-emerald-500/30">
                    ID #{profile[0].toString()} Minted
                  </span>
                )}
              </div>

              {profile && profile[6] ? (
                <div className="mt-5 space-y-4">
                  <div
                    className={`rounded-xl border p-4 ${borderCol} ${
                      isDark ? "bg-slate-950/60" : "bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 font-bold text-white shadow-md">
                          🤖
                        </div>
                        <div>
                          <div className="font-bold text-indigo-400">@{profile[1]}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            Payout: {profile[2].slice(0, 8)}...{profile[2].slice(-6)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-cyan-400">{profile[5].toString()} PTS</div>
                        <div className="text-[10px] text-emerald-400">Verified Worker</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <label className={`block text-xs font-semibold ${subtext} mb-1.5`}>Agent Handle</label>
                    <input
                      value={agentHandle}
                      onChange={(e) => setAgentHandle(e.target.value)}
                      placeholder="e.g. sentinel-guard-01"
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition ${inputBg}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold ${subtext} mb-1.5`}>
                      Payout Wallet Address
                    </label>
                    <input
                      value={payoutWalletInput}
                      onChange={(e) => setPayoutWalletInput(e.target.value)}
                      placeholder="Leave blank to use connected address"
                      className={`w-full rounded-xl border px-4 py-2.5 font-mono text-sm outline-none transition ${inputBg}`}
                    />
                  </div>
                  <button
                    disabled={isPending || !isConnected}
                    onClick={handleRegisterAgent}
                    className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {isPending ? "Minting Passport..." : "Mint ERC-8004 Agent ID"}
                  </button>
                </div>
              )}
            </div>

            {/* Card 4: Micro-Bounty Publisher */}
            <div className={`rounded-2xl border p-6 ${cardBg}`}>
              <div className="border-b pb-4">
                <h3 className="text-base font-bold">Post Micro-Bounty Task</h3>
                <p className={`text-xs ${subtext}`}>Publish task specifications for reverse-auction worker bidding</p>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className={`block text-xs font-semibold ${subtext} mb-1.5`}>
                    Task Specification Statement
                  </label>
                  <input
                    value={taskSpec}
                    onChange={(e) => setTaskSpec(e.target.value)}
                    placeholder="Task details and expected deliverables"
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition ${inputBg}`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-semibold ${subtext} mb-1.5`}>
                      Max Budget (tUSD8)
                    </label>
                    <input
                      value={maxBudget}
                      onChange={(e) => setMaxBudget(e.target.value)}
                      placeholder="0.4"
                      className={`w-full rounded-xl border px-4 py-2 font-mono text-sm outline-none transition ${inputBg}`}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className={`text-xs font-semibold ${subtext}`}>SLA Window (Sec)</label>
                    </div>
                    <input
                      value={slaSeconds}
                      onChange={(e) => setSlaSeconds(e.target.value)}
                      placeholder="60"
                      className={`w-full rounded-xl border px-4 py-2 font-mono text-sm outline-none transition ${inputBg}`}
                    />
                  </div>
                </div>

                {/* SLA Presets */}
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] ${subtext}`}>SLA Presets:</span>
                  {[
                    { sec: "60", label: "60s Demo" },
                    { sec: "300", label: "5m" },
                    { sec: "3600", label: "1h" },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setSlaSeconds(preset.sec)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-mono font-medium transition hover:border-emerald-500 ${borderCol} ${
                        isDark ? "bg-slate-950 hover:bg-slate-900" : "bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <button
                  disabled={isPending || !isConnected}
                  onClick={handlePostTask}
                  className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isPending ? "Posting Task..." : "Post Micro-Bounty Task"}
                </button>
              </div>
            </div>

            {/* Card 5: Live SLA Task Inspector & Settlement */}
            <div className={`rounded-2xl border p-6 ${cardBg}`}>
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-base font-bold">Live Task Inspector & SLA Settlement</h3>
                  <p className={`text-xs ${subtext}`}>Reverse auction bidding, live SLA countdown & settlement</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs ${subtext}`}>Task ID:</span>
                  <input
                    type="number"
                    min="1"
                    value={taskIdInput}
                    onChange={(e) => setTaskIdInput(e.target.value)}
                    className={`w-16 rounded-lg border px-2 py-1 text-center font-mono text-xs font-bold outline-none ${inputBg}`}
                  />
                </div>
              </div>

              {/* Task Details Display */}
              <div
                className={`mt-5 space-y-3 rounded-xl border p-4 ${borderCol} ${
                  isDark ? "bg-slate-950/70" : "bg-slate-50"
                }`}
              >
                {inspectedTask && inspectedTask[0] > 0n ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-cyan-400">
                        Task #{inspectedTask[0].toString()}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                          taskStatusMap[inspectedTask[11]]?.badge || ""
                        }`}
                      >
                        {taskStatusMap[inspectedTask[11]]?.label || "Unknown"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div>
                        <span className={subtext}>Max Budget: </span>
                        <span className="font-mono font-semibold">{formatUnits(inspectedTask[4], 6)} tUSD8</span>
                      </div>
                      <div>
                        <span className={subtext}>Locked Amount: </span>
                        <span className="font-mono font-semibold text-emerald-400">
                          {formatUnits(inspectedTask[8], 6)} tUSD8
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className={subtext}>Worker: </span>
                        <span className="font-mono text-[11px]">
                          {inspectedTask[7] !== "0x0000000000000000000000000000000000000000"
                            ? `${inspectedTask[7].slice(0, 10)}...${inspectedTask[7].slice(-8)}`
                            : "Awaiting winning bid"}
                        </span>
                      </div>
                    </div>

                    {/* Live SLA Countdown Pill */}
                    {inspectedTask[11] === 1 && (
                      <div
                        className={`mt-2 flex items-center justify-between rounded-lg border p-2.5 ${
                          secondsRemaining !== null && secondsRemaining > 0
                            ? isDark
                              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                              : "border-cyan-200 bg-cyan-50 text-cyan-800"
                            : isDark
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                            : "border-rose-200 bg-rose-50 text-rose-800"
                        }`}
                      >
                        <span className="text-xs font-semibold">
                          {secondsRemaining !== null && secondsRemaining > 0
                            ? "⏱ SLA Window Countdown:"
                            : "⚠️ SLA Expired:"}
                        </span>
                        <span className="font-mono text-sm font-black">
                          {secondsRemaining !== null
                            ? secondsRemaining > 0
                              ? `${Math.floor(secondsRemaining / 60)}m ${secondsRemaining % 60}s`
                              : "Deadline Passed — Refund Eligible"
                            : "Calculating..."}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-2 text-center text-xs text-slate-500">
                    No task recorded at ID #{taskIdInput} yet. Post a task or increment ID.
                  </div>
                )}
              </div>

              {/* Bidding & Settlement Actions */}
              <div className="mt-5 space-y-4">
                {/* Step A: Bid & Award */}
                <div className="space-y-2">
                  <label className={`block text-xs font-semibold ${subtext}`}>
                    Worker Reverse Auction Bid (tUSD8)
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={bidAmt}
                      onChange={(e) => setBidAmt(e.target.value)}
                      placeholder="0.25"
                      className={`w-full rounded-xl border px-4 py-2 font-mono text-sm outline-none transition ${inputBg}`}
                    />
                    <button
                      disabled={isPending || !isConnected}
                      onClick={handleBidAndAward}
                      className="whitespace-nowrap rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 transition hover:bg-amber-400 disabled:opacity-50"
                    >
                      {isPending ? "Locking..." : "Bid & Award"}
                    </button>
                  </div>
                </div>

                {/* Step B: Settle or Refund */}
                <div className="space-y-2">
                  <label className={`block text-xs font-semibold ${subtext}`}>
                    Delivery Result Proof (Hash / Output)
                  </label>
                  <input
                    value={resultText}
                    onChange={(e) => setResultText(e.target.value)}
                    placeholder="Payload text or IPFS result hash"
                    className={`w-full rounded-xl border px-4 py-2 text-sm outline-none transition ${inputBg}`}
                  />
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      disabled={isPending || !isConnected}
                      onClick={handleSettle}
                      className="rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {isPending ? "Settling..." : "Settle SLA (Pay Worker)"}
                    </button>
                    <button
                      disabled={isPending || !isConnected}
                      onClick={handleRefund}
                      className={`rounded-xl border py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                        isDark
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                          : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      }`}
                    >
                      {isPending ? "Refunding..." : "Claim Timeout Refund"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= INTERACTIVE TRANSACTION FEED ================= */}
        <section className={`mt-8 rounded-2xl border p-6 ${cardBg}`}>
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
              <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-500">
                Live On-Chain Activity & Telemetry Feed
              </h3>
            </div>
            <button
              onClick={clearLog}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition hover:border-slate-400 ${borderCol} ${subtext}`}
            >
              Clear Log
            </button>
          </div>

          <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
            {txLog.length === 0 ? (
              <p className={`py-4 text-center text-xs ${subtext}`}>No activity recorded yet.</p>
            ) : (
              txLog.map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-xs font-mono transition ${borderCol} ${
                    isDark ? "bg-slate-950/60" : "bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        item.status === "SUCCESS"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : item.status === "PENDING"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-rose-500/15 text-rose-400"
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className={`text-[11px] ${subtext}`}>{item.time}</span>
                    <span className="font-sans font-medium">{item.message}</span>
                  </div>

                  {item.txHash && (
                    <a
                      href={`https://explorer-test.qday.info/tx/${item.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-400 transition hover:bg-cyan-500/20"
                    >
                      <span>
                        {item.txHash.slice(0, 10)}...{item.txHash.slice(-8)}
                      </span>
                      <span>↗</span>
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={`mt-12 border-t py-6 text-center text-xs ${borderCol} ${subtext}`}>
        <p>Vouch8 Protocol • Built for QDay Aevum Builder Challenge #1 • Chain ID: 44005</p>
      </footer>
    </div>
  );
}
