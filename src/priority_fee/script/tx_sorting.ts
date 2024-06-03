import { assert } from "console";
import { ethers } from "ethers";
import { GasPrice } from "../../../typechain-types";
import { populateSigners } from "../../common/utils";

async function checkTxOrder(gasPrice: GasPrice, startBlock: number, endBlock: number, addresses: string[]) {
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
            const effectiveGasPrice = Number(receipt.effectiveGasPrice);
            assert(effectiveGasPrice >= prevEffectiveGasPrice || receipt.from === prevSender, "gasPrice is not sorted");
            if (prevEffectiveGasPrice === effectiveGasPrice && prevEffectiveGasPrice !== 0) {
                assert(
                    addresses.indexOf(receipt.from) < addresses.indexOf(prevSender) || receipt.from === prevSender,
                    "Time priority is not sorted"
                );
            }
            prevSender = receipt.from;
            prevEffectiveGasPrice = effectiveGasPrice;
        }
    }
}

export async function testTxSortingByGasPriceThreeUniqueSender(gasPrice: GasPrice, deployer: ethers.Wallet) {
    console.log("Test for the tx sorting by gasTip with 3 unique senders");

    const signers = await populateSigners(deployer, 3);
    const addresses = signers.map((x) => x.address);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const startBlock = await gasPrice.provider.getBlockNumber();

    console.log("Send 30 txs");
    for (let i = 0; i < 3; i++) {
        const initialNonce = await signers[i].getTransactionCount();
        for (let j = 0; j < 10; j++) {
            const randomTip = Math.floor(Math.random() * 10) * 1e9;
            if (randomTip <= 5 * 1e9) {
                await signers[i].sendTransaction({
                    to: gasPrice.address,
                    maxPriorityFeePerGas: randomTip,
                    maxFeePerGas: randomTip + 25 * 1e9,
                    data: gasPrice.interface.encodeFunctionData("increaseCount"),
                    nonce: initialNonce + j,
                });
            } else {
                await signers[i].sendTransaction({
                    to: gasPrice.address,
                    gasPrice: randomTip + 25 * 1e9,
                    data: gasPrice.interface.encodeFunctionData("increaseCount"),
                    nonce: initialNonce + j,
                });
            }
        }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const endBlock = await gasPrice.provider.getBlockNumber();

    await checkTxOrder(gasPrice, startBlock, endBlock, addresses);
}

export async function testTxSortingByGasPrice(gasPrice: GasPrice, deployer: ethers.Wallet) {
    console.log("Test for the tx sorting by gasTip");

    const signers = await populateSigners(deployer, 30);
    const addresses = signers.map((x) => x.address);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const startBlock = await gasPrice.provider.getBlockNumber();

    console.log("Send 30 txs");
    for (let i = 0; i < 30; i++) {
        const randomTip = Math.floor(Math.random() * 10) * 1e9;
        if (randomTip <= 5 * 1e9) {
            await signers[i].sendTransaction({
                to: gasPrice.address,
                maxPriorityFeePerGas: randomTip,
                maxFeePerGas: randomTip + 25 * 1e9,
                data: gasPrice.interface.encodeFunctionData("increaseCount"),
            });
        } else {
            await signers[i].sendTransaction({
                to: gasPrice.address,
                gasPrice: randomTip + 25 * 1e9,
                data: gasPrice.interface.encodeFunctionData("increaseCount"),
            });
        }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const endBlock = await gasPrice.provider.getBlockNumber();

    await checkTxOrder(gasPrice, startBlock, endBlock, addresses);
}
