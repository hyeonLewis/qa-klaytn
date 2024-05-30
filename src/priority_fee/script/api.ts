import { assert } from "console";
import { BigNumber, ethers } from "ethers";

const url = "http://127.0.0.1:8551"; // Endpoint node

const basefee = 25 * 1e9;
const maxPriorityFeePerGas = 10 * 1e9;
const numbers = 50;

async function populateTransaction(
    deployer: ethers.Wallet,
    maxPriorityFeePerGas: ethers.BigNumberish,
    numbers: number
) {
    const initialNonce = await deployer.getTransactionCount();
    for (let i = 0; i < numbers; i++) {
        await deployer.sendTransaction({
            to: deployer.address,
            value: ethers.utils.parseEther("0.1"),
            maxPriorityFeePerGas: maxPriorityFeePerGas,
            maxFeePerGas: Number(maxPriorityFeePerGas) + 25 * 1e9,
            nonce: initialNonce + i,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

export async function testEthGasPriceAndMaxPriorityTip(deployer: ethers.Wallet) {
    await populateTransaction(deployer, maxPriorityFeePerGas, numbers);

    const provider = new ethers.providers.JsonRpcProvider(url);
    const gasPrice = Number(await provider.send("eth_gasPrice", []));
    const maxPriorityFeePerGasFromProvider = Number(await provider.send("eth_maxPriorityFeePerGas", []));

    assert(maxPriorityFeePerGasFromProvider === maxPriorityFeePerGas, "eth_maxPriorityFeePerGas failed");
    assert(gasPrice === basefee * 2 + maxPriorityFeePerGasFromProvider, "eth_gasPrice failed");
}

export async function testEthFeeHistoryReward(deployer: ethers.Wallet) {
    await populateTransaction(deployer, maxPriorityFeePerGas, numbers);

    const provider = new ethers.providers.JsonRpcProvider(url);
    const currentBlock = await provider.getBlockNumber();
    const feeHistory = await provider.send("eth_feeHistory", [20, currentBlock - 1, [40, 60, 90]]);

    const basefeeHistory = feeHistory.reward;
    for (let i = 0; i < basefeeHistory.length; i++) {
        for (let j = 0; j < basefeeHistory[i].length; j++) {
            assert(Number(basefeeHistory[i][j]) === maxPriorityFeePerGas, "eth_feeHistory failed");
        }
    }
}
