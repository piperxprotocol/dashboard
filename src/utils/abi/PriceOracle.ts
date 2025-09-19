const JumpRateModelAbi = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "cash", "type": "uint256" },
            { "internalType": "uint256", "name": "borrows", "type": "uint256" },
            { "internalType": "uint256", "name": "reserves", "type": "uint256" },
            { "internalType": "uint256", "name": "reserveFactorMantissa", "type": "uint256" }
        ],
        "name": "getSupplyRate",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "cash", "type": "uint256" },
            { "internalType": "uint256", "name": "borrows", "type": "uint256" },
            { "internalType": "uint256", "name": "reserves", "type": "uint256" }
        ],
        "name": "getBorrowRate",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "cToken", "type": "address" }
        ],
        "name": "getUnderlyingPrice",
        "outputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];
export default JumpRateModelAbi;
