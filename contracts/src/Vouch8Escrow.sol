// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Vouch8ERC8004Registry.sol";
import "./Vouch8Vault.sol";

contract Vouch8Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum TaskStatus { Open, Awarded, Settled, Refunded }

    struct Task {
        uint256 id;
        address orchestratorKey;
        address vaultOwner;
        bytes32 specHash;
        uint256 maxBudget;
        uint64 slaDuration;
        uint256 minReputation;
        address winningWorker;
        uint256 lockedAmount;
        uint64 deadline;
        bytes32 resultHash;
        TaskStatus status;
    }

    IERC20 public immutable tUSD8;
    Vouch8ERC8004Registry public immutable registry;
    Vouch8Vault public vault;

    uint256 public nextTaskId = 1;
    mapping(uint256 => Task) public tasks;
    mapping(uint256 => mapping(address => uint256)) public bids;

    event TaskPosted(uint256 indexed taskId, address indexed orchestratorKey, bytes32 specHash, uint256 maxBudget, uint64 slaDuration);
    event BidSubmitted(uint256 indexed taskId, address indexed worker, uint256 bidAmount);
    event TaskAwarded(uint256 indexed taskId, address indexed worker, uint256 lockedAmount, uint64 deadline);
    event TaskSettled(uint256 indexed taskId, address indexed worker, address payoutWallet, uint256 amount, bytes32 resultHash);
    event TaskRefunded(uint256 indexed taskId, address indexed worker, address indexed vaultOwner, uint256 amount);

    constructor(address _tUSD8, address _registry) {
        require(_tUSD8 != address(0) && _registry != address(0), "Zero address");
        tUSD8 = IERC20(_tUSD8);
        registry = Vouch8ERC8004Registry(_registry);
    }

    function setVault(address _vault) external {
        require(address(vault) == address(0), "Vault already set");
        vault = Vouch8Vault(_vault);
    }

    function postTask(
        bytes32 specHash,
        uint256 maxBudget,
        uint64 slaDuration,
        uint256 minReputation
    ) external returns (uint256 taskId) {
        require(maxBudget > 0 && slaDuration > 0, "Invalid task params");
        (address owner,,,,,, bool revoked) = vault.sessions(msg.sender);
        require(owner != address(0) && !revoked, "Unauthorized orchestrator session");

        taskId = nextTaskId++;
        tasks[taskId] = Task({
            id: taskId,
            orchestratorKey: msg.sender,
            vaultOwner: owner,
            specHash: specHash,
            maxBudget: maxBudget,
            slaDuration: slaDuration,
            minReputation: minReputation,
            winningWorker: address(0),
            lockedAmount: 0,
            deadline: 0,
            resultHash: bytes32(0),
            status: TaskStatus.Open
        });

        emit TaskPosted(taskId, msg.sender, specHash, maxBudget, slaDuration);
    }

    function submitBid(uint256 taskId, uint256 bidAmount) external {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Open, "Task not open");
        require(bidAmount > 0 && bidAmount <= t.maxBudget, "Bid exceeds max budget");
        require(registry.isVerifiedAgent(msg.sender, t.minReputation), "Failed ERC-8004 check");

        bids[taskId][msg.sender] = bidAmount;
        emit BidSubmitted(taskId, msg.sender, bidAmount);
    }

    function awardBid(uint256 taskId, address worker) external nonReentrant {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Open, "Task not open");
        require(msg.sender == t.orchestratorKey || msg.sender == t.vaultOwner, "Not authorized");

        uint256 bidAmount = bids[taskId][worker];
        require(bidAmount > 0, "No bid from worker");

        address owner = vault.spendForEscrow(t.orchestratorKey, bidAmount);
        require(owner == t.vaultOwner, "Owner mismatch");

        t.winningWorker = worker;
        t.lockedAmount = bidAmount;
        t.deadline = uint64(block.timestamp) + t.slaDuration;
        t.status = TaskStatus.Awarded;

        emit TaskAwarded(taskId, worker, bidAmount, t.deadline);
    }

    function settleTask(uint256 taskId, bytes32 resultHash) external nonReentrant {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Awarded, "Task not awarded");
        require(msg.sender == t.winningWorker, "Only winning worker");
        require(block.timestamp <= t.deadline, "SLA deadline missed");
        require(resultHash != bytes32(0), "Empty result hash");

        t.resultHash = resultHash;
        t.status = TaskStatus.Settled;

        address payout = registry.getPayoutWallet(t.winningWorker);
        tUSD8.safeTransfer(payout, t.lockedAmount);
        registry.recordSLAOutcome(t.winningWorker, taskId, true);

        emit TaskSettled(taskId, t.winningWorker, payout, t.lockedAmount, resultHash);
    }

    function claimTimeoutRefund(uint256 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Awarded, "Task not awarded");
        require(block.timestamp > t.deadline, "SLA deadline not passed");

        t.status = TaskStatus.Refunded;
        tUSD8.forceApprove(address(vault), t.lockedAmount);
        vault.creditRefund(t.vaultOwner, t.lockedAmount);
        registry.recordSLAOutcome(t.winningWorker, taskId, false);

        emit TaskRefunded(taskId, t.winningWorker, t.vaultOwner, t.lockedAmount);
    }
}
