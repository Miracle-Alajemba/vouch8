// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Vouch8ERC8004Registry.sol";
import "../src/Vouch8Escrow.sol";
import "../src/Vouch8Vault.sol";

contract DeployVouch8 is Script {
    // Official QDay Aevum Testnet tUSD8 contract
    address constant TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        Vouch8ERC8004Registry registry = new Vouch8ERC8004Registry();
        Vouch8Escrow escrow = new Vouch8Escrow(TUSD8, address(registry));
        Vouch8Vault vault = new Vouch8Vault(TUSD8, address(escrow));

        registry.setEscrowContract(address(escrow));
        escrow.setVault(address(vault));

        vm.stopBroadcast();

        console.log("Vouch8ERC8004Registry:", address(registry));
        console.log("Vouch8Escrow:", address(escrow));
        console.log("Vouch8Vault:", address(vault));
    }
}
