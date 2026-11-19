// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vouch8Vault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct SessionPolicy {
        address owner;
        uint256 maxPerTask;
        uint256 dailyLimit;
        uint256 spentInWindow;
        uint64 windowStart;
        uint64 expiresAt;
        bool revoked;
    }

    IERC20 public immutable tUSD8;
    address public escrowContract;

    mapping(address => uint256) public balances;
    mapping(address => SessionPolicy) public sessions;

    event Deposited(address indexed owner, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event SessionGranted(address indexed owner, address indexed agentKey, uint256 maxPerTask, uint256 dailyLimit, uint64 expiresAt);
    event SessionRevoked(address indexed owner, address indexed agentKey);
    event SessionSpent(address indexed owner, address indexed agentKey, uint256 amount);
    event EscrowRefundCredited(address indexed owner, uint256 amount);

    constructor(address _tUSD8, address _escrowContract) {
        require(_tUSD8 != address(0) && _escrowContract != address(0), "Zero address");
        tUSD8 = IERC20(_tUSD8);
        escrowContract = _escrowContract;
    }

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        tUSD8.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient vault balance");
        balances[msg.sender] -= amount;
        tUSD8.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function grantSession(
        address agentKey,
        uint256 maxPerTask,
        uint256 dailyLimit,
        uint64 durationSeconds
    ) external {
        require(agentKey != address(0), "Invalid agent key");
        require(maxPerTask > 0 && dailyLimit >= maxPerTask, "Invalid spend limits");
        require(durationSeconds > 0, "Invalid duration");

        uint64 expiresAt = uint64(block.timestamp) + durationSeconds;
        sessions[agentKey] = SessionPolicy({
            owner: msg.sender,
            maxPerTask: maxPerTask,
            dailyLimit: dailyLimit,
            spentInWindow: 0,
            windowStart: uint64(block.timestamp),
            expiresAt: expiresAt,
            revoked: false
        });

        emit SessionGranted(msg.sender, agentKey, maxPerTask, dailyLimit, expiresAt);
    }

    function revokeSession(address agentKey) external {
        require(sessions[agentKey].owner == msg.sender, "Not session owner");
        sessions[agentKey].revoked = true;
        emit SessionRevoked(msg.sender, agentKey);
    }

    function spendForEscrow(address agentKey, uint256 amount) external nonReentrant returns (address owner) {
        require(msg.sender == escrowContract, "Only Vouch8Escrow");
        SessionPolicy storage policy = sessions[agentKey];
        owner = policy.owner;

        require(owner != address(0), "Unknown session key");
        require(!policy.revoked, "Session revoked");
        require(block.timestamp <= policy.expiresAt, "Session expired");
        require(amount <= policy.maxPerTask, "Exceeds per-task cap");

        if (block.timestamp >= policy.windowStart + 1 days) {
            policy.windowStart = uint64(block.timestamp);
            policy.spentInWindow = 0;
        }

        require(policy.spentInWindow + amount <= policy.dailyLimit, "Exceeds 24h daily limit");
        require(balances[owner] >= amount, "Insufficient owner tUSD8 balance");

        policy.spentInWindow += amount;
        balances[owner] -= amount;
        tUSD8.safeTransfer(escrowContract, amount);

        emit SessionSpent(owner, agentKey, amount);
    }

    function creditRefund(address owner, uint256 amount) external nonReentrant {
        require(msg.sender == escrowContract, "Only Vouch8Escrow");
        tUSD8.safeTransferFrom(escrowContract, address(this), amount);
        balances[owner] += amount;
        emit EscrowRefundCredited(owner, amount);
    }
}
