import { assert } from "console";
import { ethers } from "ethers";
import { GasPrice } from "../../../typechain-types";

export async function testTxSortingByGasTip(gasPrice: GasPrice, deployer: ethers.Wallet) {
    console.log("Test for the tx sorting by gasTip");

    const signers = [];

    for (let i = 0; i < 30; i++) {
        const signer = new ethers.Wallet(ethers.utils.randomBytes(32), gasPrice.provider);
        signers.push(signer);
        await deployer.sendTransaction({
            to: signer.address,
            value: ethers.utils.parseEther("1"),
        });
    }
    const addresses = signers.map((x) => x.address);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const startBlock = await gasPrice.provider.getBlockNumber();

    console.log("Send 30 txs");
    for (let i = 0; i < 30; i++) {
        const randomTip = Math.floor(Math.random() * 10) * 1e9;
        await signers[i].sendTransaction({
            to: gasPrice.address,
            maxPriorityFeePerGas: randomTip,
            maxFeePerGas: randomTip + 25 * 1e9,
            data: gasPrice.interface.encodeFunctionData("increaseCount"),
        });
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const endBlock = await gasPrice.provider.getBlockNumber();

    for (let i = startBlock; i <= endBlock; i++) {
        const receipts = [];
        const block = await gasPrice.provider.getBlock(i);
        if (block.transactions.length === 0) continue;

        for (const tx of block.transactions) {
            const txReceipt = await gasPrice.provider.getTransactionReceipt(tx);
            receipts.push(txReceipt);
        }

        let prevEffectiveGasPrice = 0;
        let prevSender = "";
        for (const receipt of receipts.reverse()) {
            const gasTip = Number(receipt.effectiveGasPrice);
            assert(gasTip >= prevEffectiveGasPrice, "GasTip is not sorted");
            if (prevEffectiveGasPrice === gasTip && prevEffectiveGasPrice !== 0) {
                assert(addresses.indexOf(receipt.from) < addresses.indexOf(prevSender), "Time priority is not sorted");
            }
            prevSender = receipt.from;
            prevEffectiveGasPrice = gasTip;
        }

        console.log("Block number: ", i);
        console.log(
            "EffectiveGasPrice of Txs in block: ",
            receipts.map((x) => Number(x.effectiveGasPrice))
        );
    }
}
