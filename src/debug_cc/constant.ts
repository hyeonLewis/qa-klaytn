export const testingAddress = "0xb1dede0e813e0c1326f71bc64dfee42b6039ed75";
export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const rpcUrl = "http://localhost:8551";

export const byteCode =
    "608060405234801561000f575f80fd5b5061010f8061001d5f395ff3fe6080604052348015600e575f80fd5b5060043610603a575f3560e01c80633fa4f24514603e57806390042fce146058578063a33a61e0146060575b5f80fd5b60446068565b604051604f919060c2565b60405180910390f35b605e606d565b005b6066608d565b005b5f5481565b5f805b600581101560895760015f54015f556001810190506070565b5050565b5f805b600581101560a8576001820191506001810190506090565b5050565b5f819050919050565b60bc8160ac565b82525050565b5f60208201905060d35f83018460b5565b9291505056fea2646970667358221220cdcc3f06c3ef57c0bf70adad1d3e61bc323471c73d44873a1b91f612dfb9bc8764736f6c63430008160033";

export const abi = [
    {
        inputs: [],
        name: "testComputationCost",
        outputs: [],
        stateMutability: "pure",
        type: "function",
    },
    {
        inputs: [],
        name: "testComputationCost2",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "value",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
];
