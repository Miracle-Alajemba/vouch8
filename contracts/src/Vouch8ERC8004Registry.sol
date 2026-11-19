// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Vouch8ERC8004Registry is ERC721URIStorage, Ownable {
    struct AgentProfile {
        uint256 agentId;
        string handle;
        address payoutWallet;
        uint256 completedTasks;
        uint256 missedTasks;
        uint256 reputationScore;
        bool active;
    }

    uint256 private _nextAgentId = 1;
    address public escrowContract;

    mapping(address => AgentProfile) public profiles;
    mapping(string => address) public handleToAddress;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string handle, address payoutWallet);
    event ReputationUpdated(address indexed agent, uint256 newScore, bool success, uint256 taskId);

    constructor() ERC721("Vouch8 ERC-8004 Agent Identity", "V8ID") Ownable(msg.sender) {}

    function setEscrowContract(address _escrow) external onlyOwner {
        escrowContract = _escrow;
    }

    function registerAgent(string calldata handle, string calldata metadataURI, address payoutWallet) external returns (uint256) {
        require(bytes(handle).length >= 3, "Handle too short");
        require(payoutWallet != address(0), "Invalid payout wallet");
        require(!profiles[msg.sender].active, "Already registered");
        require(handleToAddress[handle] == address(0), "Handle taken");

        uint256 agentId = _nextAgentId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, metadataURI);

        profiles[msg.sender] = AgentProfile({
            agentId: agentId,
            handle: handle,
            payoutWallet: payoutWallet,
            completedTasks: 0,
            missedTasks: 0,
            reputationScore: 100,
            active: true
        });
        handleToAddress[handle] = msg.sender;

        emit AgentRegistered(agentId, msg.sender, handle, payoutWallet);
        return agentId;
    }

    function recordSLAOutcome(address agent, uint256 taskId, bool success) external {
        require(msg.sender == escrowContract, "Only Vouch8Escrow");
        AgentProfile storage p = profiles[agent];
        require(p.active, "Agent not registered");

        if (success) {
            p.completedTasks += 1;
            p.reputationScore = p.reputationScore + 15 > 1000 ? 1000 : p.reputationScore + 15;
        } else {
            p.missedTasks += 1;
            p.reputationScore = p.reputationScore > 30 ? p.reputationScore - 30 : 0;
        }

        emit ReputationUpdated(agent, p.reputationScore, success, taskId);
    }

    function isVerifiedAgent(address agent, uint256 minReputation) external view returns (bool) {
        AgentProfile memory p = profiles[agent];
        return p.active && p.reputationScore >= minReputation;
    }

    function getPayoutWallet(address agent) external view returns (address) {
        require(profiles[agent].active, "Agent not registered");
        return profiles[agent].payoutWallet;
    }
}
