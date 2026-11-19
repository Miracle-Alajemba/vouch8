// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/Vouch8ERC8004Registry.sol";
import "../src/Vouch8Vault.sol";
import "../src/Vouch8Escrow.sol";

contract MockTUSD8 is ERC20 {
    constructor() ERC20("Test USD8", "tUSD8") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract Vouch8Test is Test {
    MockTUSD8 tusd8;
    Vouch8ERC8004Registry registry;
    Vouch8Escrow escrow;
    Vouch8Vault vault;

    address user = address(0x1111);
    address orchestratorKey = address(0x2222);
    address workerA = address(0x3333);
    address workerB = address(0x4444);

    function setUp() public {
        tusd8 = new MockTUSD8();
        registry = new Vouch8ERC8004Registry();
        escrow = new Vouch8Escrow(address(tusd8), address(registry));
        vault = new Vouch8Vault(address(tusd8), address(escrow));

        registry.setEscrowContract(address(escrow));
        escrow.setVault(address(vault));

        tusd8.mint(user, 10_000_000);
        vm.startPrank(user);
        tusd8.approve(address(vault), 10_000_000);
        vault.deposit(10_000_000);
        vault.grantSession(orchestratorKey, 1_000_000, 3_000_000, 1 days);
        vm.stopPrank();

        vm.prank(workerA);
        registry.registerAgent("alpha-research", "ipfs://workerA", workerA);

        vm.prank(workerB);
        registry.registerAgent("beta-indexer", "ipfs://workerB", workerB);
    }

    function testReverseAuctionAndOnTimeSettlement() public {
        vm.prank(orchestratorKey);
        uint256 taskId = escrow.postTask(keccak256("summarize-feed"), 800_000, 60, 100);

        vm.prank(workerA);
        escrow.submitBid(taskId, 600_000);

        vm.prank(workerB);
        escrow.submitBid(taskId, 450_000);

        vm.prank(orchestratorKey);
        escrow.awardBid(taskId, workerB);

        assertEq(vault.balances(user), 9_550_000);

        vm.prank(workerB);
        escrow.settleTask(taskId, keccak256("verified-summary-output"));

        assertEq(tusd8.balanceOf(workerB), 450_000);
        (,,,,, uint256 rep,) = registry.profiles(workerB);
        assertEq(rep, 115);
    }

    function testTimeoutRefundAndReputationSlash() public {
        vm.prank(orchestratorKey);
        uint256 taskId = escrow.postTask(keccak256("realtime-quote"), 500_000, 30, 100);

        vm.prank(workerA);
        escrow.submitBid(taskId, 400_000);

        vm.prank(orchestratorKey);
        escrow.awardBid(taskId, workerA);

        vm.warp(block.timestamp + 31);

        escrow.claimTimeoutRefund(taskId);

        assertEq(vault.balances(user), 10_000_000);
        (,,,,, uint256 rep,) = registry.profiles(workerA);
        assertEq(rep, 70);
    }

    function testSessionCapAndRevocationGuardrails() public {
        vm.prank(orchestratorKey);
        uint256 taskId = escrow.postTask(keccak256("expensive-job"), 2_000_000, 60, 100);

        vm.prank(workerA);
        escrow.submitBid(taskId, 1_500_000);

        vm.prank(orchestratorKey);
        vm.expectRevert("Exceeds per-task cap");
        escrow.awardBid(taskId, workerA);

        vm.prank(user);
        vault.revokeSession(orchestratorKey);

        vm.prank(workerA);
        escrow.submitBid(taskId, 500_000);

        vm.prank(orchestratorKey);
        vm.expectRevert("Session revoked");
        escrow.awardBid(taskId, workerA);
    }
}
