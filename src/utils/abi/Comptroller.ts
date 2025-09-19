const ComptrollerAbi = [
    {
        "inputs": [],
        "name": "getAllMarkets",
        "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "account", "type": "address" },
            { "internalType": "address", "name": "cToken", "type": "address" }
        ],
        "name": "checkMembership",
        "outputs": [
            { "internalType": "bool", "name": "", "type": "bool" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "", "type": "address" }
        ],
        "name": "markets",
        "outputs": [
            { "internalType": "bool", "name": "isListed", "type": "bool" },
            { "internalType": "uint256", "name": "collateralFactorMantissa", "type": "uint256" },
            { "internalType": "bool", "name": "isComped", "type": "bool" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];
export default ComptrollerAbi;
