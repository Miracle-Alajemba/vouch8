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

/** Custom Geometric SVG Shield-and-Figure-8 Monogram Logo */
function Vouch8Monogram({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer Shield Outline */}
      <path
        d="M18 4L7 8V16.8C7 23.4 11.7 29.5 18 31.2C24.3 29.5 29 23.4 29 16.8V8L18 4Z"
        className="stroke-emerald-600 dark:stroke-emerald-500"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Upper Loop of Figure-8 */}
      <circle
        cx="18"
        cy="13"
        r="3.2"
        className="stroke-emerald-600 dark:stroke-emerald-500"
        strokeWidth="1.5"
      />
      {/* Lower Loop of Figure-8 */}
      <circle
        cx="18"
        cy="21.2"
        r="3.8"
        className="stroke-emerald-600 dark:stroke-emerald-500"
        strokeWidth="1.5"
      />
      {/* Continuous Geometric Cross Links */}
      <path
        d="M15.4 17.1L20.6 17.1"
        className="stroke-emerald-600 dark:stroke-emerald-500"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="18" cy="13" r="1.1" className="fill-emerald-600 dark:fill-emerald-500" />
      <circle cx="18" cy="21.2" r="1.2" className="fill-emerald-600 dark:fill-emerald-500" />
    </svg>
  );
}

export default function App() {
  // Navigation View State: "landing" (default) or "app" (live dashboard)
  const [view, setView] = useState<"landing" | "app">("landing");

  // Copy-to-clipboard state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Theme state with localStorage persistence (defaults to dark or system preference)
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
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, [theme]);

  // Wagmi Hooks
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();

  // Connected wallet native tQDAY gas balance
  const { data: gasBalance } = useBalance({
    address,
    chainId: qdayAevum.id,
  });

  // State
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

  // Telemetry Log Feed
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

  // On-Chain Reads
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

  // SLA Live Countdown Timer
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

  // ================= 1-CLICK TUSD8 FAUCET STATE =================
  const [faucetStatus, setFaucetStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [faucetTxHash, setFaucetTxHash] = useState<string | null>(null);
  const [faucetErrorMsg, setFaucetErrorMsg] = useState<string | null>(null);
  const [faucetCooldownRemainingMs, setFaucetCooldownRemainingMs] = useState<number>(0);

  const formatCooldown = (ms: number) => {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // Cooldown countdown timer tick
  useEffect(() => {
    if (faucetCooldownRemainingMs <= 0) return;
    const interval = setInterval(() => {
      setFaucetCooldownRemainingMs((prev) => {
        if (prev <= 1000) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [faucetCooldownRemainingMs]);

  // Check cooldown status for connected address
  useEffect(() => {
    if (!address) {
      setFaucetCooldownRemainingMs(0);
      return;
    }
    let isMounted = true;
    fetch(`/api/faucet?address=${address}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (!data.canClaim && data.remainingMs > 0) {
          setFaucetCooldownRemainingMs(data.remainingMs);
        } else {
          setFaucetCooldownRemainingMs(0);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [address]);

  const handleRequestFaucet = async () => {
    if (!address) {
      addLog("ERROR", "Please connect your wallet first to request test tUSD8.");
      return;
    }
    try {
      setFaucetStatus("pending");
      setFaucetErrorMsg(null);
      setFaucetTxHash(null);
      addLog("PENDING", "Requesting 10 tUSD8 from protocol faucet...");

      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Faucet claim failed.");
      }

      setFaucetStatus("success");
      setFaucetTxHash(data.txHash);
      if (data.nextEligibleTime) {
        setFaucetCooldownRemainingMs(Math.max(0, data.nextEligibleTime - Date.now()));
      }
      addLog("SUCCESS", `Dripped 10 tUSD8 to ${address.slice(0, 6)}...${address.slice(-4)}!`, data.txHash);
      refetchWallet();
      refetchVault();
    } catch (err: unknown) {
      setFaucetStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      setFaucetErrorMsg(msg);
      addLog("ERROR", `Faucet request failed: ${msg}`);
      if (msg.includes("Cooldown active")) {
        fetch(`/api/faucet?address=${address}`)
          .then((r) => r.json())
          .then((d) => {
            if (d?.remainingMs) setFaucetCooldownRemainingMs(d.remainingMs);
          })
          .catch(() => {});
      }
    }
  };

  // Stepper state
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
      addLog("SUCCESS", `Deposited ${depositAmt} tUSD8 to Vault`, hash);
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
      addLog("SUCCESS", `Withdrew ${withdrawAmt} tUSD8 to liquid wallet`, hash);
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
      addLog("SUCCESS", `Session authorized: Max $${maxPerTask}/task, $${dailyLimit}/day`, hash);
      refetchSession();
    } catch (e: unknown) {
      addLog("ERROR", `Session grant failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRevokeSession = async () => {
    try {
      if (!address) return;
      const targetKey = (agentKey && isAddress(agentKey) ? agentKey : address) as `0x${string}`;
      addLog("PENDING", `KILL-SWITCH: Revoking session ${targetKey.slice(0, 8)}...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.vault,
        abi: VAULT_ABI,
        functionName: "revokeSession",
        args: [targetKey],
      });
      addLog("SUCCESS", `Emergency revocation confirmed: Session key disabled`, hash);
      refetchSession();
    } catch (e: unknown) {
      addLog("ERROR", `Revocation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRegisterAgent = async () => {
    try {
      if (!address) return;
      const payout = payoutWalletInput && isAddress(payoutWalletInput) ? payoutWalletInput : address;
      addLog("PENDING", `Minting ERC-8004 Passport for @${agentHandle}...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.registry,
        abi: REGISTRY_ABI,
        functionName: "registerAgent",
        args: [agentHandle, `ipfs://vouch8/${agentHandle}`, payout],
      });
      addLog("SUCCESS", `ERC-8004 Identity minted for @${agentHandle}`, hash);
      refetchProfile();
    } catch (e: unknown) {
      addLog("ERROR", `Registration failed: ${e instanceof Error ? e.message : String(e)}`);
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
      addLog("SUCCESS", `Task posted to reverse auction escrow ($${maxBudget} tUSD8)`, hash);
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
      addLog("PENDING", `Submitting bid of ${bidAmt} tUSD8 on Task #${id}...`);
      await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "submitBid",
        args: [id, parseUnits(bidAmt, 6)],
      });
      addLog("PENDING", `Awarding Task #${id} & locking ${bidAmt} tUSD8...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "awardBid",
        args: [id, address],
      });
      addLog("SUCCESS", `Task #${id} awarded & budget locked in escrow`, hash);
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
      addLog("PENDING", `Settling Task #${id} with delivery proof...`);
      const hash = await writeContractAsync({
        address: VOUCH8_ADDRESSES.escrow,
        abi: ESCROW_ABI,
        functionName: "settleTask",
        args: [id, keccak256(toBytes(resultText))],
      });
      addLog("SUCCESS", `Task #${id} settled! Payout transferred to worker`, hash);
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
      addLog("SUCCESS", `SLA timeout confirmed: 100% refunded to vault`, hash);
      refetchVault();
      refetchProfile();
      refetchTask();
    } catch (e: unknown) {
      addLog("ERROR", `Refund claim failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Formatting helpers
  const repScore = profile && profile[6] ? Number(profile[5]) : 0;
  const completedCount = profile && profile[6] ? Number(profile[3]) : 0;
  const missedCount = profile && profile[6] ? Number(profile[4]) : 0;

  const taskStatus = inspectedTask ? inspectedTask[11] : null;

  const scrollToSection = (id: string) => {
    if (view !== "landing") {
      setView("landing");
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div
      className={`${
        theme === "dark" ? "dark" : ""
      } min-h-screen bg-[#FAFAFA] text-gray-900 transition-colors duration-150 dark:bg-[#0B0F17] dark:text-gray-100`}
    >
      {/* ============================================================== */}
      {/* ======================= SHARED TOP NAVBAR ==================== */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-white/90 backdrop-blur-md dark:border-[#1F2937] dark:bg-[#0B0F17]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3.5 py-2.5 sm:px-6 sm:py-3">
          {/* Brand Mark with Monogram - Clicking returns to landing page */}
          <button
            onClick={() => {
              setView("landing");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="group flex items-center gap-2.5 text-left transition shrink-0"
          >
            <Vouch8Monogram className="h-7 w-7 sm:h-8 sm:w-8 transition-transform duration-200 group-hover:scale-105" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                Vouch8
              </span>
              <span className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 md:inline-block dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                {view === "app" ? "Command Center" : "Autonomous Protocol"}
              </span>
            </div>
          </button>

          {/* Center: Navigation Links (Landing View) or Live Network (App View) */}
          {view === "landing" ? (
            <nav className="hidden items-center gap-6 text-xs font-medium text-gray-600 md:flex dark:text-gray-400">
              <button
                onClick={() => scrollToSection("how-it-works")}
                className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection("architecture")}
                className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                Architecture
              </button>
              <button
                onClick={() => scrollToSection("deployments")}
                className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                Deployments
              </button>
              <a
                href="https://github.com/Miracle-Alajemba/vouch8"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                GitHub ↗
              </a>
            </nav>
          ) : (
            <div className="hidden items-center gap-4 md:flex">
              {/* Back to landing button */}
              <button
                onClick={() => setView("landing")}
                className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <span>←</span>
                <span>Overview</span>
              </button>

              {/* Live Network Status Pill */}
              <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-500"></span>
                </span>
                <span>QDay Aevum · 44005</span>
              </div>
            </div>
          )}

          {/* Right Controls: Theme Toggle & Action CTA */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Mobile Compact Theme Toggle Icon */}
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              aria-label="Toggle Theme"
              className="flex sm:hidden h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {theme === "dark" ? (
                <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
            </button>

            {/* Desktop Segmented Light / Dark Toggle */}
            <div className="hidden sm:flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium dark:border-gray-800 dark:bg-gray-900">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  theme === "light"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  theme === "dark"
                    ? "bg-gray-800 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <svg className="h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
                <span>Dark</span>
              </button>
            </div>

            {/* Launch App Button or Connected Wallet Pill */}
            {view === "landing" ? (
              <button
                onClick={() => setView("app")}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] sm:px-3.5"
              >
                <span>Launch App</span>
                <span>→</span>
              </button>
            ) : (
              <>
                {/* Network Switcher if needed */}
                {isConnected && chainId !== qdayAevum.id && (
                  <button
                    onClick={() => switchChain({ chainId: qdayAevum.id })}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 sm:px-3 sm:py-1.5 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  >
                    Switch to Aevum
                  </button>
                )}

                {!isConnected ? (
                  <button
                    onClick={() => connect({ connector: injected() })}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 sm:px-3.5"
                  >
                    Connect Wallet
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      <span className="font-mono text-gray-800 dark:text-gray-200">
                        {address?.slice(0, 5)}...{address?.slice(-3)}
                      </span>
                      <span className="hidden text-gray-400 md:inline">·</span>
                      <span className="hidden font-mono text-gray-500 md:inline dark:text-gray-400">
                        {gasBalance
                          ? `${parseFloat(formatUnits(gasBalance.value, gasBalance.decimals)).toFixed(3)} ${gasBalance.symbol}`
                          : "0 tQDAY"}
                      </span>
                    </div>
                    <button
                      onClick={() => disconnect()}
                      className="ml-0.5 text-gray-400 transition hover:text-gray-600 dark:hover:text-gray-200"
                      title="Disconnect"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* ====================== 1. LANDING PAGE VIEW ================== */}
      {/* ============================================================== */}
      {view === "landing" ? (
        <div className="relative">
          {/* Hero Section */}
          <section className="relative mx-auto max-w-7xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:pt-28 lg:pb-28">
            <div className="text-center">
              {/* Responsive Network Pill Badge */}
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] sm:px-3.5 sm:py-1.5 sm:text-xs font-medium text-gray-700 shadow-sm transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-700">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-500"></span>
                </span>
                <span className="truncate sm:hidden">QDay Aevum · 44005 · ERC-8004</span>
                <span className="hidden sm:inline">Live on QDay Aevum Testnet • Chain ID 44005 • ERC-8004 + tUSD8</span>
              </div>

              {/* Main Headline with Roboto Typography */}
              <h1 className="font-roboto mx-auto mt-5 sm:mt-6 max-w-4xl text-[30px] leading-[1.18] sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                Trustless Escrow &amp; Spend Guardrails for{" "}
                <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 bg-clip-text text-transparent dark:from-emerald-400 dark:via-teal-300 dark:to-emerald-400">
                  Autonomous AI Agents
                </span>
              </h1>

              {/* Subheadline */}
              <p className="mx-auto mt-4 sm:mt-6 max-w-2xl text-sm sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed px-1 sm:px-0">
                Vouch8 empowers autonomous AI agents to hire sub-agents, compete in reverse-auctions, and settle
                micro-tasks in <span className="font-semibold text-gray-900 dark:text-white">tUSD8</span> with strict
                per-task spend caps, verified ERC-8004 confirmation of payee, and automated SLA timeout refunds.
              </p>

              {/* Hero CTA Buttons */}
              <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full max-w-xs sm:max-w-none mx-auto">
                <button
                  onClick={() => setView("app")}
                  className="flex h-12 sm:h-auto items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:shadow active:scale-[0.99]"
                >
                  <span>Launch Protocol App</span>
                  <span>→</span>
                </button>
                <a
                  href={`https://explorer-test.qday.info/address/${VOUCH8_ADDRESSES.escrow}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 sm:h-auto items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 active:scale-[0.99] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <span>View Contracts on Explorer</span>
                  <span>↗</span>
                </a>
              </div>
            </div>

            {/* Protocol Live Preview Card */}
            <div className="mx-auto mt-10 sm:mt-14 max-w-4xl px-0 sm:px-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 sm:pb-4 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[11px] sm:text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400">
                      Live QDay Aevum Telemetry
                    </span>
                  </div>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] sm:text-[11px] font-mono text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    Chain ID: 44005
                  </span>
                </div>

                <div className="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-800">
                  <div className="pt-2 sm:pt-0">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wider">Vault Secured</div>
                    <div className="mt-1 font-mono-num font-mono text-2xl font-bold text-gray-900 dark:text-white">
                      {vaultBal !== undefined ? parseFloat(formatUnits(vaultBal, 6)).toFixed(2) : "10.00"}{" "}
                      <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">tUSD8</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">Guardrailed principal balance</p>
                  </div>

                  <div className="pt-3 sm:pt-0 sm:pl-6">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wider">ERC-8004 Identity</div>
                    <div className="mt-1 font-mono-num font-mono text-2xl font-bold text-gray-900 dark:text-white">
                      {profile && profile[6] ? `${profile[5].toString()}` : "100"}{" "}
                      <span className="text-xs font-normal text-gray-400">/ 1000 PTS</span>
                    </div>
                    <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">Deterministic SLA Scoring</p>
                  </div>

                  <div className="pt-3 sm:pt-0 sm:pl-6">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wider">SLA Settlement</div>
                    <div className="mt-1 font-mono-num font-mono text-2xl font-bold text-gray-900 dark:text-white">
                      Sub-Second
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">Automated 100% Timeout Refund</p>
                  </div>
                </div>

                <div className="mt-5 sm:mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-3 sm:p-3.5 text-xs dark:border-gray-800 dark:bg-gray-950/50">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      REVERSE AUCTION
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 text-[11px] sm:text-xs">
                      Task #1 awarded at 0.25 tUSD8 · 60s SLA countdown active
                    </span>
                  </div>
                  <button
                    onClick={() => setView("app")}
                    className="font-medium text-emerald-600 hover:underline dark:text-emerald-400 text-[11px] sm:text-xs shrink-0"
                  >
                    Open Live Inspector →
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 3-Pillar Architecture Grid ("Why Vouch8") */}
          <section id="architecture" className="border-t border-gray-200 bg-white py-16 sm:py-20 dark:border-gray-800 dark:bg-[#0E131F]">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
              <div className="text-center">
                <span className="text-xs font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                  Core Primitives
                </span>
                <h2 className="font-display mt-2 text-2xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Why Vouch8: Built for Machine-to-Machine Economies
                </h2>
                <p className="mx-auto mt-3 sm:mt-4 max-w-2xl text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  Traditional web3 escrows assume human oversight. Vouch8 introduces cryptographic session scoping and
                  programmatic reputation specifically engineered for autonomous agent sub-contracting.
                </p>
              </div>

              <div className="mt-12 sm:mt-16 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
                {/* Pillar 1 */}
                <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] p-6 sm:p-8 transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-[#111827] dark:hover:border-gray-700">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-display mt-5 text-lg font-bold text-gray-900 dark:text-white">
                    Least-Privilege Agent Vaults
                  </h3>
                  <p className="mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">Vouch8Vault.sol</p>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    Non-custodial tUSD8 vaults equipped with per-task spend limits, 24-hour rolling budget caps, expiring
                    session delegation, and an instant 1-click emergency kill-switch to protect against runaway prompts.
                  </p>
                </div>

                {/* Pillar 2 */}
                <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] p-6 sm:p-8 transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-[#111827] dark:hover:border-gray-700">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-display mt-5 text-lg font-bold text-gray-900 dark:text-white">
                    ERC-8004 Confirmation of Payee
                  </h3>
                  <p className="mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">Vouch8ERC8004Registry.sol</p>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    On-chain agent identity passports minted as ERC-721 NFTs. Features deterministic 0–1000 reputation
                    scoring that rewards verified SLA completions (+15) and slashes failures (-30).
                  </p>
                </div>

                {/* Pillar 3 */}
                <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] p-6 sm:p-8 transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-[#111827] dark:hover:border-gray-700">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-display mt-5 text-lg font-bold text-gray-900 dark:text-white">
                    Reverse-Auction &amp; SLA Escrow
                  </h3>
                  <p className="mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">Vouch8Escrow.sol</p>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    Worker sub-agents compete in real time to bid down task prices. Winning funds lock securely and
                    release upon verified output hash—or trigger a 100% automatic timeout refund if the deadline expires.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 4-Step Interactive Lifecycle Flow ("How It Works") */}
          <section id="how-it-works" className="border-t border-gray-200 py-16 sm:py-20 dark:border-gray-800">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
              <div className="text-center">
                <span className="text-xs font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                  Execution Flow
                </span>
                <h2 className="font-display mt-2 text-2xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                  How Autonomous Agents Coordinate on Vouch8
                </h2>
                <p className="mx-auto mt-3 sm:mt-4 max-w-2xl text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  From human principal funding to zero-trust sub-agent task delivery in four verifiable steps.
                </p>
              </div>

              <div className="mt-12 sm:mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {/* Step 1 */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm dark:border-gray-800 dark:bg-[#111827]">
                  <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">STEP 01</span>
                  <h4 className="font-display mt-2 text-base font-bold text-gray-900 dark:text-white">Fund Vault &amp; Scope Key</h4>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Principal deposits tUSD8 and delegates an ephemeral session key with strict per-task ($0.50) and daily
                    ($2.00) spend ceilings.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm dark:border-gray-800 dark:bg-[#111827]">
                  <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">STEP 02</span>
                  <h4 className="font-display mt-2 text-base font-bold text-gray-900 dark:text-white">Post Micro-Bounty</h4>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Orchestrator publishes cryptographic spec hash with max budget (e.g. 0.40 tUSD8) and an SLA deadline
                    window (60s to 1h).
                  </p>
                </div>

                {/* Step 3 */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm dark:border-gray-800 dark:bg-[#111827]">
                  <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">STEP 03</span>
                  <h4 className="font-display mt-2 text-base font-bold text-gray-900 dark:text-white">Reverse-Auction &amp; Lock</h4>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Registered ERC-8004 agents submit bids. Orchestrator awards the lowest verified bid, locking budget
                    directly into escrow.
                  </p>
                </div>

                {/* Step 4 */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm dark:border-gray-800 dark:bg-[#111827]">
                  <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">STEP 04</span>
                  <h4 className="font-display mt-2 text-base font-bold text-gray-900 dark:text-white">Settle or Auto-Refund</h4>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Worker posts delivery hash for instant release (+15 reputation), or principal claims 100% timeout
                    refund if SLA is breached.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Verified QDay Aevum Contracts & Developer Section */}
          <section id="deployments" className="border-t border-gray-200 bg-white py-20 dark:border-gray-800 dark:bg-[#0E131F]">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
              <div className="text-center">
                <span className="text-xs font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                  Verified Deployments
                </span>
                <h2 className="font-display mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-white">
                  Live Contracts on QDay Aevum Testnet
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                  All contracts are deployed and verified on QDay Aevum Testnet (Chain ID 44005).
                </p>
              </div>

              {/* 4 Contract Cards */}
              <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  {
                    name: "Vouch8Vault",
                    desc: "Session-scoped spend limits, daily caps & instant kill-switch",
                    address: VOUCH8_ADDRESSES.vault,
                  },
                  {
                    name: "Vouch8ERC8004Registry",
                    desc: "Agent identity NFTs (V8ID) & deterministic SLA reputation",
                    address: VOUCH8_ADDRESSES.registry,
                  },
                  {
                    name: "Vouch8Escrow",
                    desc: "Reverse-auction bidding & automated timeout refund escrow",
                    address: VOUCH8_ADDRESSES.escrow,
                  },
                  {
                    name: "tUSD8 Stablecoin",
                    desc: "Official testnet stablecoin (6 decimals) powering agent micro-tasks",
                    address: TUSD8_ADDRESS,
                  },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="flex flex-col justify-between rounded-xl border border-gray-200 bg-[#FAFAFA] p-5 dark:border-gray-800 dark:bg-[#111827]"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">{item.name}</span>
                        <a
                          href={`https://explorer-test.qday.info/address/${item.address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          Explorer ↗
                        </a>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                        {item.address.slice(0, 10)}...{item.address.slice(-8)}
                      </span>
                      <button
                        onClick={() => copyToClipboard(item.name, item.address)}
                        className="rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        {copiedKey === item.name ? "Copied!" : "Copy Address"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Developer SDK Quickstart Snippet */}
              <div className="mt-8 rounded-xl border border-gray-200 bg-[#FAFAFA] p-6 dark:border-gray-800 dark:bg-[#111827]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      @vouch8/sdk
                    </span>
                    <span className="text-xs text-gray-500">TypeScript SDK Quickstart</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard("sdk", "npm install @vouch8/sdk viem")}
                    className="font-mono text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    {copiedKey === "sdk" ? "Copied!" : "Copy Command"}
                  </button>
                </div>
                <div className="mt-3 overflow-x-auto font-mono text-xs text-gray-700 dark:text-gray-300">
                  <code>npm install @vouch8/sdk viem</code>
                </div>
              </div>

              {/* Launch CTA Banner */}
              <div className="mt-12 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 sm:p-8 text-center dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Ready to test autonomous agent micro-settlement?
                </h3>
                <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600 dark:text-gray-400">
                  Connect MetaMask on QDay Aevum Testnet to deposit tUSD8, grant session guardrails, and run reverse-auctions.
                </p>
                <button
                  onClick={() => {
                    setView("app");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <span>Launch Command Center</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </section>

          {/* Minimalist Landing Footer */}
          <footer className="border-t border-gray-200 py-8 text-center text-xs text-gray-400 dark:border-gray-800">
            <p>Vouch8 Protocol · QDay Aevum Builder Challenge #1 · Chain ID: 44005</p>
          </footer>
        </div>
      ) : (
        /* ============================================================== */
        /* ================== 2. COMMAND CENTER DASHBOARD =============== */
        /* ============================================================== */
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {/* Dashboard Header Bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-800">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Autonomous Agent Command Center</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Manage guardrailed session keys, verify ERC-8004 passports, and monitor live reverse-auction tasks.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Faucet Trigger Button */}
              <button
                disabled={faucetStatus === "pending" || faucetCooldownRemainingMs > 0 || !isConnected}
                onClick={handleRequestFaucet}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                title="Claim 10 test tUSD8 from the protocol faucet"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <span>
                  {faucetStatus === "pending"
                    ? "Dripping..."
                    : faucetCooldownRemainingMs > 0
                    ? `Cooldown (${formatCooldown(faucetCooldownRemainingMs)})`
                    : "Get test tUSD8"}
                </span>
              </button>

              <button
                onClick={() => setView("landing")}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                ← Back to Overview
              </button>
            </div>
          </div>

          {/* Faucet Notification Banner */}
          {faucetStatus === "success" && faucetTxHash && (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-800 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">✓ 10 tUSD8 Sent!</span>
                <span className="text-gray-600 dark:text-gray-400">Tokens transferred to your wallet on QDay Aevum.</span>
                <a
                  href={`https://explorer-test.qday.info/tx/${faucetTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-medium underline hover:text-emerald-950 dark:hover:text-emerald-100"
                >
                  View Tx ↗
                </a>
              </div>
              <button
                onClick={() => setFaucetStatus("idle")}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
          )}
          {faucetStatus === "error" && faucetErrorMsg && (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-800 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <span className="font-semibold">⚠️ Faucet Notice:</span>
                <span>{faucetErrorMsg}</span>
              </div>
              <button
                onClick={() => setFaucetStatus("idle")}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
          )}

          {/* ================= 4-CARD PROTOCOL TELEMETRY STRIP ================= */}
          <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Wallet Liquid tUSD8 */}
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 transition-colors hover:border-gray-300 dark:border-[#1F2937] dark:bg-[#111827] dark:hover:border-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium tracking-wide uppercase text-[11px]">Liquid Balance</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  Wallet
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                  {walletTusd8 !== undefined ? parseFloat(formatUnits(walletTusd8, 6)).toFixed(2) : "0.00"}
                </span>
                <span className="text-xs font-medium text-gray-500">tUSD8</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Available for vault deposits & bids</p>
            </div>

            {/* Card 2: Vault Budget */}
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 transition-colors hover:border-gray-300 dark:border-[#1F2937] dark:bg-[#111827] dark:hover:border-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium tracking-wide uppercase text-[11px]">Vault Secured</span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                  Guardrailed
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {vaultBal !== undefined ? parseFloat(formatUnits(vaultBal, 6)).toFixed(2) : "0.00"}
                </span>
                <span className="text-xs font-medium text-emerald-600/80 dark:text-emerald-400/80">tUSD8</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Secured against autonomous runaway spend</p>
            </div>

            {/* Card 3: ERC-8004 Reputation Gauge */}
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 transition-colors hover:border-gray-300 dark:border-[#1F2937] dark:bg-[#111827] dark:hover:border-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium tracking-wide uppercase text-[11px]">ERC-8004 Passport</span>
                {profile && profile[6] ? (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    @{profile[1]}
                  </span>
                ) : (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    Unregistered
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                    {repScore}
                  </span>
                  <span className="text-xs text-gray-400">/ 1000</span>
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {completedCount} completed · {missedCount} missed
                </span>
              </div>
              {/* Visual Gauge Bar */}
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300 dark:bg-emerald-500"
                  style={{ width: `${Math.min(100, Math.max(4, (repScore / 1000) * 100))}%` }}
                ></div>
              </div>
            </div>

            {/* Card 4: Active Session Policy */}
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 transition-colors hover:border-gray-300 dark:border-[#1F2937] dark:bg-[#111827] dark:hover:border-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium tracking-wide uppercase text-[11px]">Session Policy</span>
                {sessionPolicy && sessionPolicy[0] !== "0x0000000000000000000000000000000000000000" ? (
                  sessionPolicy[6] ? (
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950/50 dark:text-red-400">
                      Revoked
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                      Active
                    </span>
                  )
                ) : (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    None
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Max / Task:</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-white">
                    {sessionPolicy && sessionPolicy[0] !== "0x0000000000000000000000000000000000000000"
                      ? `$${formatUnits(sessionPolicy[1], 6)}`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Daily Limit:</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-white">
                    {sessionPolicy && sessionPolicy[0] !== "0x0000000000000000000000000000000000000000"
                      ? `$${formatUnits(sessionPolicy[2], 6)}`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Spent in 24h:</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-white">
                    {sessionPolicy && sessionPolicy[0] !== "0x0000000000000000000000000000000000000000"
                      ? `$${formatUnits(sessionPolicy[3], 6)}`
                      : "$0.00"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ================= GUIDED 4-STAGE WORKFLOW STEPPER ================= */}
          <section className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-5 dark:border-[#1F2937] dark:bg-[#111827]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400">
                Protocol Execution Pipeline
              </h2>
              <span className="text-xs text-gray-400">QDay Aevum Testnet</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Stage 1 */}
              <div
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  isStage1Complete
                    ? "border-emerald-200 bg-emerald-50/50 text-gray-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-gray-100"
                    : "border-gray-200 bg-gray-50/50 text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400"
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isStage1Complete
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {isStage1Complete ? "✓" : "1"}
                </div>
                <div>
                  <p className="text-xs font-semibold">1. Fund Vault</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Deposit tUSD8 principal</p>
                </div>
              </div>

              {/* Stage 2 */}
              <div
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  isStage2Complete
                    ? "border-emerald-200 bg-emerald-50/50 text-gray-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-gray-100"
                    : "border-gray-200 bg-gray-50/50 text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400"
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isStage2Complete
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {isStage2Complete ? "✓" : "2"}
                </div>
                <div>
                  <p className="text-xs font-semibold">2. Scope Session</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Delegate spend caps</p>
                </div>
              </div>

              {/* Stage 3 */}
              <div
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  isStage3Complete
                    ? "border-emerald-200 bg-emerald-50/50 text-gray-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-gray-100"
                    : "border-gray-200 bg-gray-50/50 text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400"
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isStage3Complete
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {isStage3Complete ? "✓" : "3"}
                </div>
                <div>
                  <p className="text-xs font-semibold">3. Mint ERC-8004</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Agent Identity NFT</p>
                </div>
              </div>

              {/* Stage 4 */}
              <div
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  isStage4Complete
                    ? "border-emerald-200 bg-emerald-50/50 text-gray-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-gray-100"
                    : "border-gray-200 bg-gray-50/50 text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400"
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isStage4Complete
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {isStage4Complete ? "✓" : "4"}
                </div>
                <div>
                  <p className="text-xs font-semibold">4. SLA Settlement</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Reverse auction & payout</p>
                </div>
              </div>
            </div>
          </section>

          {/* ================= ONBOARDING EMPTY STATE (when vault balance is 0) ================= */}
          {(vaultBal === undefined || vaultBal === 0n) && (
            <section className="mb-8 rounded-xl border border-emerald-200 bg-white p-5 sm:p-6 shadow-sm dark:border-emerald-900/60 dark:bg-[#111827]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Onboarding: Vault Balance is 0.00 tUSD8
                      </h3>
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Step 1 Required
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 max-w-xl leading-relaxed">
                      Your Vouch8 Vault currently holds 0.00 tUSD8. Claim 10 test tUSD8 from the 1-click faucet to fund your vault, scope session keys, and dispatch autonomous agent reverse-auctions.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <button
                    disabled={faucetStatus === "pending" || faucetCooldownRemainingMs > 0 || !isConnected}
                    onClick={handleRequestFaucet}
                    className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>
                      {faucetStatus === "pending"
                        ? "Dripping 10 tUSD8..."
                        : faucetCooldownRemainingMs > 0
                        ? `Cooldown (${formatCooldown(faucetCooldownRemainingMs)})`
                        : "Get test tUSD8 (10 tUSD8)"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Inline status feedback */}
              {faucetStatus === "success" && faucetTxHash && (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">✓ 10 tUSD8 claimed!</span>
                    <span>Deposit your tokens in the Treasury card below to finish onboarding.</span>
                    <a
                      href={`https://explorer-test.qday.info/tx/${faucetTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono font-medium underline hover:text-emerald-950 dark:hover:text-emerald-100"
                    >
                      Explorer ↗
                    </a>
                  </div>
                  <button onClick={() => setFaucetStatus("idle")} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
              )}
              {faucetStatus === "error" && faucetErrorMsg && (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold">⚠️</span>
                    <span>{faucetErrorMsg}</span>
                  </div>
                  <button onClick={() => setFaucetStatus("idle")} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
              )}
            </section>
          )}

          {/* ================= TWO-COLUMN WORKSPACE ================= */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* ================= LEFT COLUMN: TREASURY & GUARDRAILS ================= */}
            <div className="space-y-6">
              {/* Card 1: tUSD8 Treasury (Deposit & Withdraw) */}
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 dark:border-[#1F2937] dark:bg-[#111827]">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">tUSD8 Vault Treasury</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Deposit or withdraw guardrailed principal</p>
                  </div>
                  {/* Clean Tab Segment */}
                  <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium dark:border-gray-800 dark:bg-gray-900">
                    <button
                      onClick={() => setActiveTreasuryTab("deposit")}
                      className={`rounded-md px-3 py-1 transition ${
                        activeTreasuryTab === "deposit"
                          ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white"
                          : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      }`}
                    >
                      Deposit
                    </button>
                    <button
                      onClick={() => setActiveTreasuryTab("withdraw")}
                      className={`rounded-md px-3 py-1 transition ${
                        activeTreasuryTab === "withdraw"
                          ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white"
                          : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      }`}
                    >
                      Withdraw
                    </button>
                  </div>
                </div>

                {activeTreasuryTab === "deposit" ? (
                  <div className="mt-5 space-y-4">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Deposit amount</span>
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
                        placeholder="0.0"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 font-mono text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900 dark:focus:border-emerald-500"
                      />
                      <button
                        disabled={isPending || !isConnected}
                        onClick={handleDeposit}
                        className="whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isPending ? "Confirming..." : "Deposit tUSD8"}
                      </button>
                    </div>
                    {/* Preset Quick Fill Pills */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-400">Presets:</span>
                      {["1.0", "2.0", "5.0", "10.0"].map((val) => (
                        <button
                          key={val}
                          onClick={() => setDepositAmt(val)}
                          className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-600 transition hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
                          +{val}
                        </button>
                      ))}
                    </div>

                    {walletTusd8 !== undefined && walletTusd8 === 0n && (
                      <div className="flex items-center justify-between rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 p-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                        <span>Need funds to deposit?</span>
                        <button
                          type="button"
                          disabled={faucetStatus === "pending" || faucetCooldownRemainingMs > 0 || !isConnected}
                          onClick={handleRequestFaucet}
                          className="font-semibold underline hover:text-emerald-950 disabled:opacity-50 dark:hover:text-emerald-100"
                        >
                          {faucetStatus === "pending"
                            ? "Dripping..."
                            : faucetCooldownRemainingMs > 0
                            ? `Cooldown (${formatCooldown(faucetCooldownRemainingMs)})`
                            : "Claim 10 test tUSD8 ↗"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Withdrawal amount</span>
                      <span className="font-mono">
                        Vault: {vaultBal !== undefined ? parseFloat(formatUnits(vaultBal, 6)).toFixed(2) : "0.00"} tUSD8
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={withdrawAmt}
                        onChange={(e) => setWithdrawAmt(e.target.value)}
                        placeholder="0.0"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 font-mono text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900 dark:focus:border-emerald-500"
                      />
                      <button
                        disabled={isPending || !isConnected}
                        onClick={handleWithdraw}
                        className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-800 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-750"
                      >
                        {isPending ? "Confirming..." : "Withdraw"}
                      </button>
                    </div>
                    {/* Max Pill */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-400">Quick:</span>
                      <button
                        onClick={() => setWithdrawAmt(vaultBal ? formatUnits(vaultBal, 6) : "0")}
                        className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-600 transition hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                      >
                        MAX Vault
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Session Policy & Scoped Delegation */}
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 dark:border-[#1F2937] dark:bg-[#111827]">
                <div className="border-b border-gray-100 pb-4 dark:border-gray-800">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Session Policy Delegation</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Grant bounded spend limits to autonomous agent orchestrator keys
                  </p>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Agent Public Key (Address)
                    </label>
                    <input
                      value={agentKey}
                      onChange={(e) => setAgentKey(e.target.value)}
                      placeholder="Leave blank to use connected address"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 font-mono text-xs outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900 dark:focus:border-emerald-500"
                    />
                  </div>

                  {/* Preset Limit Pills */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-600 dark:text-gray-400">Spend Guardrail Presets</span>
                      <span className="text-gray-400">Max Task / Daily Cap</span>
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
                          className="rounded-lg border border-gray-200 bg-gray-50 py-1.5 text-center font-mono text-xs text-gray-700 transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-700"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Max Per Task (tUSD8)
                      </label>
                      <input
                        value={maxPerTask}
                        onChange={(e) => setMaxPerTask(e.target.value)}
                        placeholder="0.5"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 font-mono text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900 dark:focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Daily Cap (tUSD8)
                      </label>
                      <input
                        value={dailyLimit}
                        onChange={(e) => setDailyLimit(e.target.value)}
                        placeholder="2.0"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 font-mono text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900 dark:focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Policy Duration
                    </label>
                    <select
                      value={sessionDurationDays}
                      onChange={(e) => setSessionDurationDays(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <option value="1">1 Day (24 Hours)</option>
                      <option value="7">7 Days (Standard Sprint)</option>
                      <option value="30">30 Days (Production Agent)</option>
                    </select>
                  </div>

                  <button
                    disabled={isPending || !isConnected}
                    onClick={handleGrantSession}
                    className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isPending ? "Authorizing..." : "Authorize Session Key"}
                  </button>
                </div>
              </div>

              {/* Emergency Kill-Switch Banner */}
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 dark:border-red-950/60 dark:bg-red-950/15">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-red-700 dark:text-red-400">
                      Emergency Kill-Switch (1-Click Revocation)
                    </h4>
                    <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/70">
                      Instantly revokes session key authority on-chain, freezing pending escrow draws and halting rogue autonomous loops.
                    </p>
                  </div>
                  <button
                    disabled={isPending || !isConnected}
                    onClick={handleRevokeSession}
                    className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/60"
                  >
                    {isPending ? "Revoking..." : "Revoke Session"}
                  </button>
                </div>
              </div>
            </div>

            {/* ================= RIGHT COLUMN: IDENTITY & ESCROW ================= */}
            <div className="space-y-6">
              {/* Card 3: ERC-8004 Agent Passport */}
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 dark:border-[#1F2937] dark:bg-[#111827]">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">ERC-8004 Agent Passport</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">On-chain identity NFT & Confirmation of Payee</p>
                  </div>
                  {profile && profile[6] && (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                      Verified ID #{profile[0].toString()}
                    </span>
                  )}
                </div>

                {profile && profile[6] ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">@{profile[1]}</div>
                          <div className="font-mono text-xs text-gray-500 dark:text-gray-400">
                            Payout: {profile[2].slice(0, 8)}...{profile[2].slice(-6)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {profile[5].toString()} PTS
                          </div>
                          <div className="text-[11px] text-gray-400">Reputation Score</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Agent Handle</label>
                      <input
                        value={agentHandle}
                        onChange={(e) => setAgentHandle(e.target.value)}
                        placeholder="e.g. sentinel-guard-01"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Payout Wallet Address
                      </label>
                      <input
                        value={payoutWalletInput}
                        onChange={(e) => setPayoutWalletInput(e.target.value)}
                        placeholder="Leave blank to use connected address"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 font-mono text-xs outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900"
                      />
                    </div>
                    <button
                      disabled={isPending || !isConnected}
                      onClick={handleRegisterAgent}
                      className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isPending ? "Minting..." : "Mint ERC-8004 Agent ID"}
                    </button>
                  </div>
                )}
              </div>

              {/* Card 4: Micro-Bounty Publisher */}
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 dark:border-[#1F2937] dark:bg-[#111827]">
                <div className="border-b border-gray-100 pb-4 dark:border-gray-800">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Publish Micro-Bounty Task</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Post task specifications for reverse auction bidding</p>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Task Specification Statement
                    </label>
                    <input
                      value={taskSpec}
                      onChange={(e) => setTaskSpec(e.target.value)}
                      placeholder="Task details and expected deliverables"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Max Budget (tUSD8)
                      </label>
                      <input
                        value={maxBudget}
                        onChange={(e) => setMaxBudget(e.target.value)}
                        placeholder="0.4"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 font-mono text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        SLA Window (Seconds)
                      </label>
                      <input
                        value={slaSeconds}
                        onChange={(e) => setSlaSeconds(e.target.value)}
                        placeholder="60"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 font-mono text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900"
                      />
                    </div>
                  </div>

                  {/* SLA Presets */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400">SLA Presets:</span>
                    {[
                      { sec: "60", label: "60s" },
                      { sec: "300", label: "5m" },
                      { sec: "3600", label: "1h" },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setSlaSeconds(preset.sec)}
                        className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-600 transition hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <button
                    disabled={isPending || !isConnected}
                    onClick={handlePostTask}
                    className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isPending ? "Posting..." : "Post Micro-Bounty"}
                  </button>
                </div>
              </div>

              {/* Card 5: Live SLA Task Inspector & Settlement */}
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 dark:border-[#1F2937] dark:bg-[#111827]">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Live Task Inspector & Settlement</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Reverse auction bidding & deadline verification</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400">ID:</span>
                    <input
                      type="number"
                      min="1"
                      value={taskIdInput}
                      onChange={(e) => setTaskIdInput(e.target.value)}
                      className="w-14 rounded border border-gray-200 bg-white px-2 py-1 text-center font-mono text-xs font-medium outline-none dark:border-gray-800 dark:bg-gray-900"
                    />
                  </div>
                </div>

                {/* Task Details Display */}
                <div className="mt-5 space-y-3 rounded-lg border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                  {inspectedTask && inspectedTask[0] > 0n ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-medium text-gray-900 dark:text-white">
                          Task #{inspectedTask[0].toString()}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                            taskStatus === 0
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                              : taskStatus === 1
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                              : taskStatus === 2
                              ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                              : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                          }`}
                        >
                          {taskStatus === 0
                            ? "Open (Bidding)"
                            : taskStatus === 1
                            ? "Awarded (Active SLA)"
                            : taskStatus === 2
                            ? "Settled (SLA Met)"
                            : "Refunded (SLA Missed)"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">Budget: </span>
                          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
                            {formatUnits(inspectedTask[4], 6)} tUSD8
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Locked: </span>
                          <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                            {formatUnits(inspectedTask[8], 6)} tUSD8
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-400">Worker: </span>
                          <span className="font-mono text-[11px] text-gray-700 dark:text-gray-300">
                            {inspectedTask[7] !== "0x0000000000000000000000000000000000000000"
                              ? `${inspectedTask[7].slice(0, 10)}...${inspectedTask[7].slice(-8)}`
                              : "Awaiting winning bid"}
                          </span>
                        </div>
                      </div>

                      {/* Live SLA Countdown */}
                      {taskStatus === 1 && (
                        <div className="mt-2 flex items-center justify-between rounded border border-gray-200 bg-white p-2.5 text-xs dark:border-gray-800 dark:bg-gray-900">
                          <span className="text-gray-500 dark:text-gray-400">
                            {secondsRemaining !== null && secondsRemaining > 0
                              ? "⏱ SLA Window Countdown:"
                              : "⚠️ SLA Expired:"}
                          </span>
                          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
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
                    <div className="py-2 text-center text-xs text-gray-400">
                      No task recorded at ID #{taskIdInput} yet.
                    </div>
                  )}
                </div>

                {/* Bidding & Actions */}
                <div className="mt-5 space-y-4">
                  {/* Submit Bid & Award */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Reverse Auction Bid (tUSD8)
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={bidAmt}
                        onChange={(e) => setBidAmt(e.target.value)}
                        placeholder="0.25"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 font-mono text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900"
                      />
                      <button
                        disabled={isPending || !isConnected}
                        onClick={handleBidAndAward}
                        className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-800 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-750"
                      >
                        {isPending ? "Locking..." : "Bid & Award"}
                      </button>
                    </div>
                  </div>

                  {/* Settle or Refund */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Delivery Result Proof (Hash / Output)
                    </label>
                    <input
                      value={resultText}
                      onChange={(e) => setResultText(e.target.value)}
                      placeholder="Payload text or IPFS result hash"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-gray-800 dark:bg-gray-900"
                    />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        disabled={isPending || !isConnected}
                        onClick={handleSettle}
                        className="rounded-lg bg-emerald-600 py-2.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isPending ? "Settling..." : "Settle SLA (Pay Worker)"}
                      </button>
                      <button
                        disabled={isPending || !isConnected}
                        onClick={handleRefund}
                        className="rounded-lg border border-gray-300 bg-white py-2.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750"
                      >
                        {isPending ? "Refunding..." : "Claim Timeout Refund"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ================= INTERACTIVE ACTIVITY FEED ================= */}
          <section className="mt-8 rounded-xl border border-[#E5E7EB] bg-white p-6 dark:border-[#1F2937] dark:bg-[#111827]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <h3 className="text-xs font-semibold tracking-wider uppercase text-gray-600 dark:text-gray-400">
                  Live On-Chain Activity &amp; Telemetry Feed
                </h3>
              </div>
              <button
                onClick={clearLog}
                className="text-xs text-gray-400 transition hover:text-gray-600 dark:hover:text-gray-200"
              >
                Clear Feed
              </button>
            </div>

            <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
              {txLog.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">No activity recorded yet.</p>
              ) : (
                txLog.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-2.5 text-xs font-mono dark:border-gray-800 dark:bg-gray-900/40"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          item.status === "SUCCESS"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                            : item.status === "PENDING"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                            : "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="text-[11px] text-gray-400">{item.time}</span>
                      <span className="font-sans text-gray-700 dark:text-gray-300">{item.message}</span>
                    </div>

                    {item.txHash && (
                      <a
                        href={`https://explorer-test.qday.info/tx/${item.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-mono text-[11px] text-emerald-600 transition hover:underline dark:text-emerald-400"
                      >
                        <span>
                          {item.txHash.slice(0, 8)}...{item.txHash.slice(-6)}
                        </span>
                        <span>↗</span>
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Minimalist App Footer */}
          <footer className="mt-12 border-t border-[#E5E7EB] py-6 text-center text-xs text-gray-400 dark:border-[#1F2937]">
            <p>Vouch8 Protocol · Built for QDay Aevum Builder Challenge #1 · Chain ID: 44005</p>
          </footer>
        </main>
      )}
    </div>
  );
}
