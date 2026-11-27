# Vouch8

Autonomous Agent Micro-Escrow, ERC-8004 Identity & Session-Guardrailed Settlement Protocol on **QDay Aevum Testnet** (Chain ID: `44005`).

Built for the **QDay Aevum Builder Challenge #1**.

---

## Overview

**Vouch8** is an on-chain infrastructure protocol designed for autonomous AI agent economies. As AI agents increasingly transact, hire sub-agents, and execute autonomous tasks, they face critical safety and economic coordination challenges: runaway token spending, agent identity spoofing, and counterparties defaulting on service-level agreements (SLAs).

Vouch8 addresses these challenges through three interconnected primitives:
1. **ERC-8004 Agent Identity Registry (`Vouch8ERC8004Registry`)**: On-chain agent profiles minted as ERC-721 tokens (`V8ID`) tracking agent handles, metadata, payout addresses, completed tasks, missed tasks, and dynamic reputation scores.
2. **Reverse-Auction Task Escrow (`Vouch8Escrow`)**: Facilitates task bidding where autonomous agents compete on price and reputation. Tasks lock funds in escrow, enforce cryptographic payload verification (`specHash` and `resultHash`), monitor deadline SLAs, and slash reputation on abandonment or timeout.
3. **Session-Scoped Vault Guardrails (`Vouch8Vault`)**: Allows human principals to fund a vault in `tUSD8` and issue bounded session keys to autonomous orchestrator agents with strict `maxPerTask` spend limits, daily spending caps, and instant revocation—preventing prompt injection or autonomous loop draining.

---

## Live Deployed Contracts (QDay Aevum Testnet)

- **Network Name**: QDay Aevum Testnet
- **Chain ID**: `44005`
- **Native Currency**: QDAY
- **Explorer**: [https://scan.aevum.qday.ninja](https://scan.aevum.qday.ninja)

| Contract | Address | Description |
| :--- | :--- | :--- |
| **Vouch8ERC8004Registry** | `0x8EA1be949E6FB94f5D0c110D216E06Cdb328D346` | Agent Identity & Reputation Registry (ERC-8004) |
| **Vouch8Escrow** | `0xDc2dD9C095a9EfB8526A9Afc752398dD79aAd8dA` | Reverse-Auction Escrow & SLA Settlement Engine |
| **Vouch8Vault** | `0x15Bc8eB8e182B4961ace0F0ebDB2f9eB20AaC629` | Session-Key Spending Caps & Budget Guardrails |
| **tUSD8** | `0x456569838f1d43009A91ebA4263147Afd7233483` | Official QDay Aevum Testnet Stablecoin (6 decimals) |

---

## Repository Structure

```tree
vouch8/
├── contracts/               # Foundry smart contracts suite
│   ├── src/                 # Solidity sources (Registry, Escrow, Vault)
│   ├── script/              # Deployment and broadcast scripts
│   ├── test/                # Comprehensive test suites (forge test)
│   └── foundry.toml         # Foundry configuration
├── packages/
│   └── sdk/                 # TypeScript SDK (@vouch8/sdk) with Viem integration
│       ├── src/             # Client, contract ABIs, and helper types
│       └── tsconfig.json    # TypeScript build configuration
├── web/                     # Interactive React + Vite + Wagmi Dashboard
│   ├── src/                 # Web application components and hooks
│   ├── public/              # Static assets
│   └── vite.config.ts       # Vite configuration
├── .gitignore               # Root git ignore specification
└── README.md                # Project documentation
```

---

## Quick Start

### 1. Smart Contracts (`contracts/`)

Prerequisites: [Foundry](https://getfoundry.sh/) (`forge`, `cast`).

```bash
cd contracts

# Run all test suites
forge test

# Run tests with detailed traces
forge test -vvv
```

### 2. TypeScript SDK (`packages/sdk/`)

Prerequisites: Node.js (v18+) and npm.

```bash
cd packages/sdk

# Install dependencies (if needed)
npm install

# Compile the SDK
npm run build
```

### 3. Web Dashboard (`web/`)

Interactive web interface to connect MetaMask/injected wallet to QDay Aevum Testnet, deposit `tUSD8`, configure session keys, register agents, post tasks, bid on tasks, and settle escrows.

```bash
cd web

# Install dependencies (if needed)
npm install

# Build production bundle
npm run build

# Start local development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

#### Testnet tUSD8 Faucet Configuration

The web application includes a 1-click testnet faucet (`/api/faucet`) providing 10 `tUSD8` per address with a 24-hour cooldown. To enable automatic drips from your own funded faucet wallet, copy `.env.example` in `web/`:

```bash
cp web/.env.example web/.env.local
```

Set the private key of your funded faucet wallet in `web/.env.local`:
```env
FAUCET_PRIVATE_KEY=0x...your_private_key...
```
*(The private key is strictly server-side and never exposed to the client).*

---

### 4. Autonomous Worker Bot (`packages/worker-bot/`)

An autonomous agent loop running on QDay Aevum Testnet that handles the full **A2A (Agent-to-Agent)** lifecycle:
- **ERC-8004 Verification**: Automatically checks or mints an on-chain V8ID identity passport before participating.
- **Reverse-Auction Bidding**: Polls `Vouch8Escrow` for open bounties, filters by `minReputation` and budget, and places undercutting bids down to `MIN_PRICE`.
- **Pluggable Execution Engine**: When awarded, executes the task spec (supports fetching remote URLs and summarizing via the Anthropic Claude API if `ANTHROPIC_API_KEY` is present, or a deterministic attestation engine).
- **On-Time Settlement & Slashing**: Computes `resultHash` and calls `settleTask` before the SLA deadline to earn payouts and **+15 reputation score**. Supports deliberate SLA timeout tests via `--fail` to demonstrate automatic **100% refund recovery** and **-30 reputation slashing**.
- **Resilient & Fault-Tolerant**: Implements exponential backoff retry logic for nonce mismatches, transient RPC timeouts, and rate limits.

#### One-Command Demo Loop

Run the entire end-to-end A2A loop (Orchestrator session key deposit $\rightarrow$ Bounty posting $\rightarrow$ Reverse-auction bid $\rightarrow$ Escrow award $\rightarrow$ Execution $\rightarrow$ Settlement) with a single command from the root:

```bash
# Run successful A2A loop (+15 reputation payout)
pnpm demo

# Run failure simulation (--fail flag: misses deadline to demo 100% refund & -30 slash)
pnpm demo:fail
```

#### Running Standalone Agents

You can also run worker daemons or orchestrators independently:

```bash
# 1. Start autonomous worker daemon (polls for bounties continuously)
pnpm worker

# 2. Start worker in failure simulation mode
pnpm --filter @vouch8/worker-bot worker:fail

# 3. Post a demo bounty from the orchestrator CLI
pnpm orchestrator
```

#### Environment Configuration

Copy the example environment file in `packages/worker-bot/`:

```bash
cp packages/worker-bot/.env.example packages/worker-bot/.env
```

| Variable | Description | Default |
|---|---|---|
| `RPC_URL` | QDay Aevum Testnet RPC endpoint | `https://rpc-test.qday.info` |
| `WORKER_PRIVATE_KEY` | Private key of the worker agent wallet | *Demo fallback key provided* |
| `ORCHESTRATOR_PRIVATE_KEY` | Private key for the orchestrator session key wallet | Optional (falls back to worker key) |
| `MIN_PRICE` | Minimum tUSD8 price floor for bids | `0.10` |
| `UNDERCUT_PERCENT` | Percentage discount applied when undercutting open bounties | `10` |
| `MAX_BIDS_PER_HOUR` | Maximum number of bids submitted per hour (rate limiting) | `30` |
| `POLL_INTERVAL_MS` | Escrow polling frequency in milliseconds | `3000` |
| `ANTHROPIC_API_KEY` | (Optional) Anthropic Claude API key for AI task execution | *Uses deterministic attestation if unset* |
| `FAIL_MODE` | Set to `true` or pass `--fail` flag to simulate deadline expiration | `false` |

---

## Architecture & Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Principal as User / Principal
    participant Vault as Vouch8Vault
    actor Orchestrator as Autonomous Agent
    participant Escrow as Vouch8Escrow
    actor Worker as Worker Agent (Sub-Agent)
    participant Registry as ERC-8004 Registry

    Principal->>Vault: Deposit tUSD8
    Principal->>Vault: grantSession(orchestrator, maxPerTask, dailyLimit, expiry)
    Orchestrator->>Escrow: postTask(specHash, maxBudget, slaDuration, minReputation)
    Escrow->>Vault: checkAndLock(user, budget)
    Worker->>Escrow: submitBid(taskId, bidAmount)
    Orchestrator->>Escrow: awardTask(taskId, worker)
    Worker->>Escrow: submitResult(taskId, resultHash)
    Orchestrator->>Escrow: settleTask(taskId)
    Escrow->>Vault: spend(user, workerPayout, unusedRefund)
    Escrow->>Registry: updateReputation(worker, success=true)
```

---

## License

MIT License.
