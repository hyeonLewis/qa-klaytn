import hre from "hardhat";

const totalBlock = 20;
const tpb = 3;
const testonce = 0;

// setInterval(() => console.log(
//     eth.blockNumber,
//     parseInt(eth.gasPrice),
//     parseInt(eth.maxPriorityFeePerGas), '\t',
//     eth.feeHistory(20, 'latest', [60]).reward.flat().map((n) => parseInt(parseInt(n)/1e9)), '\t',
//     eth.feeHistory(20, 'latest').baseFeePerGas.map((n) => parseInt(parseInt(n)/1e9))
//   ), 1000)

/*
// SPDX-License-Identifier: MIT

pragma solidity ^0.8;

contract GasBurner {
    uint256[10000] arr;
    function consume(uint256 num) public {
        for (uint256 i=0; i<num; i++) {
            arr[i] += i;
        }
    }
}
*/
const abi =
    '[{"inputs":[{"internalType":"uint256","name":"num","type":"uint256"}],"name":"consume","outputs":[],"stateMutability":"nonpayable","type":"function"}]';
const code =
    "0x6080604052348015600e575f80fd5b506101b48061001c5f395ff3fe608060405234801561000f575f80fd5b5060043610610029575f3560e01c8063483f31ab1461002d575b5f80fd5b610047600480360381019061004291906100c6565b610049565b005b5f5b8181101561008b57805f826127108110610068576100676100f1565b5b015f828254610077919061014b565b92505081905550808060010191505061004b565b5050565b5f80fd5b5f819050919050565b6100a581610093565b81146100af575f80fd5b50565b5f813590506100c08161009c565b92915050565b5f602082840312156100db576100da61008f565b5b5f6100e8848285016100b2565b91505092915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffd5b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f61015582610093565b915061016083610093565b92508282019050808211156101785761017761011e565b5b9291505056fea2646970667358221220b7ea334535cbbee97b700012dc6cce67791b4f5333b217b9150e5a3e2b28979664736f6c634300081a0033";
const addr = ""; // baobab

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const userPk = hre.ethers.Wallet.createRandom().privateKey;
    const sender = new hre.ethers.Wallet(userPk, deployer.provider);
    const tx = await deployer.sendTransaction({
        to: sender.address,
        value: hre.ethers.utils.parseEther("1000"),
    });
    await tx.wait(1);

    const iface = new hre.ethers.utils.Interface(abi);
    const data = iface.encodeFunctionData("consume", [8000]);

    let to = addr;
    if (to.length == 0) {
        const deployTx = await sender.sendTransaction({ data: code });
        const deployRc = await deployTx.wait();
        to = deployRc.contractAddress;
        console.log("GasBurner deployed at", to);
    } else {
        console.log("Using GasBurner at", to);
    }

    if (testonce) {
        const callTx = await sender.sendTransaction({ to, data });
        const callRc = await callTx.wait();
        console.log("One call costs", callRc.gasUsed, "gas");
        return;
    }

    const initialNonce = await sender.getTransactionCount();

    for (let i = 0; i < totalBlock; i++) {
        let p = [];
        for (let j = 0; j < tpb; j++) {
            const tx = sender.sendTransaction({
                to: to,
                data: data,
                maxFeePerGas: hre.ethers.utils.parseUnits("100", "gwei"),
                maxPriorityFeePerGas: hre.ethers.utils.parseUnits("2", "gwei"),
                nonce: initialNonce + i * tpb + j,
                gasLimit: hre.ethers.utils.parseUnits("100000000", "wei"),
            });
            p.push(tx);
        }
        await Promise.all(p);
        console.log(i);
        await new Promise((resolve) => setTimeout(resolve, 900));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
