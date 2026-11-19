export declare const TUSD8_ADDRESS: "0x456569838f1d43009A91ebA4263147Afd7233483";
export declare const QDAY_AEVUM_CHAIN: {
    readonly id: 44005;
    readonly name: "QDay Aevum Testnet";
    readonly nativeCurrency: {
        readonly name: "tQDAY";
        readonly symbol: "tQDAY";
        readonly decimals: 18;
    };
    readonly rpcUrls: {
        readonly default: {
            readonly http: readonly ["https://rpc-test.qday.info"];
        };
    };
    readonly blockExplorers: {
        readonly default: {
            readonly name: "QDay Explorer";
            readonly url: "https://explorer-test.qday.info";
        };
    };
};
export declare const ERC20_ABI: readonly [{
    readonly name: "approve";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "balanceOf";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "decimals";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint8";
    }];
}];
export declare const VAULT_ABI: readonly [{
    readonly name: "deposit";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "withdraw";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "grantSession";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "agentKey";
        readonly type: "address";
    }, {
        readonly name: "maxPerTask";
        readonly type: "uint256";
    }, {
        readonly name: "dailyLimit";
        readonly type: "uint256";
    }, {
        readonly name: "durationSeconds";
        readonly type: "uint64";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "revokeSession";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "agentKey";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "balances";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "sessions";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "agentKey";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "maxPerTask";
        readonly type: "uint256";
    }, {
        readonly name: "dailyLimit";
        readonly type: "uint256";
    }, {
        readonly name: "spentInWindow";
        readonly type: "uint256";
    }, {
        readonly name: "windowStart";
        readonly type: "uint64";
    }, {
        readonly name: "expiresAt";
        readonly type: "uint64";
    }, {
        readonly name: "revoked";
        readonly type: "bool";
    }];
}];
export declare const REGISTRY_ABI: readonly [{
    readonly name: "registerAgent";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "handle";
        readonly type: "string";
    }, {
        readonly name: "metadataURI";
        readonly type: "string";
    }, {
        readonly name: "payoutWallet";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "isVerifiedAgent";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "agent";
        readonly type: "address";
    }, {
        readonly name: "minReputation";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "profiles";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "agent";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
    }, {
        readonly name: "handle";
        readonly type: "string";
    }, {
        readonly name: "payoutWallet";
        readonly type: "address";
    }, {
        readonly name: "completedTasks";
        readonly type: "uint256";
    }, {
        readonly name: "missedTasks";
        readonly type: "uint256";
    }, {
        readonly name: "reputationScore";
        readonly type: "uint256";
    }, {
        readonly name: "active";
        readonly type: "bool";
    }];
}];
export declare const ESCROW_ABI: readonly [{
    readonly name: "postTask";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "specHash";
        readonly type: "bytes32";
    }, {
        readonly name: "maxBudget";
        readonly type: "uint256";
    }, {
        readonly name: "slaDuration";
        readonly type: "uint64";
    }, {
        readonly name: "minReputation";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "submitBid";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "taskId";
        readonly type: "uint256";
    }, {
        readonly name: "bidAmount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "awardBid";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "taskId";
        readonly type: "uint256";
    }, {
        readonly name: "worker";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "settleTask";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "taskId";
        readonly type: "uint256";
    }, {
        readonly name: "resultHash";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "claimTimeoutRefund";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "taskId";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "nextTaskId";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "tasks";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "taskId";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly name: "orchestratorKey";
        readonly type: "address";
    }, {
        readonly name: "vaultOwner";
        readonly type: "address";
    }, {
        readonly name: "specHash";
        readonly type: "bytes32";
    }, {
        readonly name: "maxBudget";
        readonly type: "uint256";
    }, {
        readonly name: "slaDuration";
        readonly type: "uint64";
    }, {
        readonly name: "minReputation";
        readonly type: "uint256";
    }, {
        readonly name: "winningWorker";
        readonly type: "address";
    }, {
        readonly name: "lockedAmount";
        readonly type: "uint256";
    }, {
        readonly name: "deadline";
        readonly type: "uint64";
    }, {
        readonly name: "resultHash";
        readonly type: "bytes32";
    }, {
        readonly name: "status";
        readonly type: "uint8";
    }];
}];
//# sourceMappingURL=abis.d.ts.map