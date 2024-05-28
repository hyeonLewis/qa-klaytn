import { assert } from "console";
import { ethers } from "ethers";
import { GasPrice } from "../../../typechain-types";

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
        let prevNonce = 0;
        let prevSender = "";
        for (const receipt of receipts.reverse()) {
            const gasPrice = Number(receipt.effectiveGasPrice);
            const nonce = receipt.transactionIndex;
            assert(
                gasPrice >= prevEffectiveGasPrice || (receipt.from === prevSender && nonce + 1 === prevNonce),
                "gasPrice is not sorted"
            );
            if (prevEffectiveGasPrice === gasPrice && prevEffectiveGasPrice !== 0) {
                assert(
                    addresses.indexOf(receipt.from) < addresses.indexOf(prevSender) ||
                        (receipt.from === prevSender && nonce + 1 === prevNonce),
                    "Time priority is not sorted"
                );
            }
            prevNonce = receipt.transactionIndex;
            prevSender = receipt.from;
            prevEffectiveGasPrice = gasPrice;
        }
    }
}

export async function testTxSortingByGasPriceThreeUniqueSender(gasPrice: GasPrice, deployer: ethers.Wallet) {
    console.log("Test for the tx sorting by gasTip with 3 unique senders");

    const signers = [];

    for (let i = 0; i < 3; i++) {
        const signer = new ethers.Wallet(ethers.utils.randomBytes(32), gasPrice.provider);
        signers.push(signer);
        await deployer.sendTransaction({
            to: signer.address,
            value: ethers.utils.parseEther("5"),
        });
    }
    const addresses = signers.map((x) => x.address);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const startBlock = await gasPrice.provider.getBlockNumber();

    console.log("Send 30 txs");
    for (let i = 0; i < 3; i++) {
        const initialNonce = await signers[i].getTransactionCount();
        for (let j = 0; j < 10; j++) {
            const randomTip = Math.floor(Math.random() * 10) * 1e9;
            await signers[i].sendTransaction({
                to: gasPrice.address,
                maxPriorityFeePerGas: randomTip,
                maxFeePerGas: randomTip + 25 * 1e9,
                data: gasPrice.interface.encodeFunctionData("increaseCount"),
                nonce: initialNonce + j,
            });
        }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const endBlock = await gasPrice.provider.getBlockNumber();

    await checkTxOrder(gasPrice, startBlock, endBlock, addresses);
}

export async function testTxSortingByGasPrice(gasPrice: GasPrice, deployer: ethers.Wallet) {
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

    await checkTxOrder(gasPrice, startBlock, endBlock, addresses);
}
