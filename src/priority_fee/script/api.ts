import { assert } from "console";
import { BigNumber, ethers } from "ethers";
import { provider } from "./main";

const basefee = 25 * 1e9;
const maxPriorityFeePerGas = 10 * 1e9;
const numbers = 50;

function checkForkLevels(ethTxHF: number, magmaHF: number, kaiaHF: number) {
    if (
        !ethTxHF ||
        !magmaHF ||
        !kaiaHF ||
        ethTxHF === 0 ||
        magmaHF === 0 ||
        kaiaHF === 0 ||
        ethTxHF + 10 > magmaHF ||
        magmaHF + 10 > kaiaHF
    ) {
        throw new Error("Fork levels are not set properly");
    }
}

async function getForkLevels() {
    const chainConfig = await provider.send("kaia_getChainConfig", []);
    const ethTxHF = Number(chainConfig["ethTxTypeCompatibleBlock"]);
    const magmaHF = Number(chainConfig["magmaCompatibleBlock"]);
    const kaiaHF = Number(chainConfig["kaiaCompatibleBlock"]);
    checkForkLevels(ethTxHF, magmaHF, kaiaHF);

    return { ethTxHF, magmaHF, kaiaHF };
}

async function populateTransaction(
    deployer: ethers.Wallet,
    maxPriorityFeePerGas: ethers.BigNumberish,
    numbers: number
) {
    const randomSender = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
    const tx = await deployer.sendTransaction({
        to: randomSender.address,
        value: ethers.utils.parseEther("100"),
    });
    await tx.wait(1);
    const initialNonce = await randomSender.getTransactionCount();
    for (let i = 0; i < numbers; i++) {
        await randomSender.sendTransaction({
            to: randomSender.address,
            value: ethers.utils.parseEther("0.1"),
            maxPriorityFeePerGas: maxPriorityFeePerGas,
            maxFeePerGas: Number(maxPriorityFeePerGas) + 25 * 1e9,
            nonce: initialNonce + i,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

export async function testVariousForkLevels(deployer: ethers.Wallet) {
    const { ethTxHF, magmaHF, kaiaHF } = await getForkLevels();
    // It tests 1) eth_sendTransaction rejection, 2) eth_gasPrice, 3) eth_maxPriorityFeePerGas for each fork level
    // 1. Before ethTxTypeCompatibleBlock
    await testEthSendTransactionBeforeEthTxType(deployer);
    await testGasPriceBeforeEthTxType(deployer);
    await testMaxPriorityFeePerGasBeforeEthTxType(deployer);
    console.log("Waiting for the ethTx fork level...");
    // 2. After ethTxTypeCompatibleBlock, before magmaCompatibleBlock
    while ((await provider.getBlockNumber()) < ethTxHF) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await testEthSendTransactionAfterEthTxType(deployer);
    await testGasPriceAfterEthTxType(deployer);
    await testMaxPriorityFeePerGasAfterEthTxType(deployer);
    console.log("Waiting for the magma fork level...");
    // 3. After magmaCompatibleBlock, before kaiaCompatibleBlock
    while ((await provider.getBlockNumber()) < magmaHF) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await testEthSendTransactionAfterMagma(deployer);
    await testGasPriceAfterMagma(deployer);
    await testMaxPriorityFeePerGasAfterMagma(deployer);
    console.log("Waiting for the kaia fork level...");
    // 4. After kaiaCompatibleBlock
    while ((await provider.getBlockNumber()) < kaiaHF) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await testEthSendTransactionAfterKaia(deployer);
    await testGasPriceAndMaxPriorityFeePerGasAfterKaia(deployer);
    await testFeeHistoryRewardAfterKaia(deployer);
}

async function testFeeHistoryRewardAfterKaia(deployer: ethers.Wallet) {
    const currentBlock = await provider.getBlockNumber();
    const feeHistory = await provider.send("eth_feeHistory", [20, currentBlock - 1, [40, 60, 90]]);

    const basefeeHistory = feeHistory.reward;
    for (let i = 0; i < basefeeHistory.length; i++) {
        for (let j = 0; j < basefeeHistory[i].length; j++) {
            assert(Number(basefeeHistory[i][j]) === maxPriorityFeePerGas, "eth_feeHistory failed");
        }
    }
}

async function testGasPriceAndMaxPriorityFeePerGasAfterKaia(deployer: ethers.Wallet) {
    await populateTransaction(deployer, maxPriorityFeePerGas, numbers);

    const gasPrice = Number(await provider.send("eth_gasPrice", []));
    const maxPriorityFeePerGasFromProvider = Number(await provider.send("eth_maxPriorityFeePerGas", []));
    console.log("gasPrice: ", gasPrice);
    console.log("tip: ", maxPriorityFeePerGasFromProvider);

    assert(maxPriorityFeePerGasFromProvider === maxPriorityFeePerGas, "eth_maxPriorityFeePerGas failed");
    assert(gasPrice === basefee + maxPriorityFeePerGasFromProvider, "eth_gasPrice failed");
}

async function testEthSendTransactionAfterKaia(deployer: ethers.Wallet) {
    // 1. Test for the case when maxPriorityFeePerGas is greater than maxFeePerGas
    try {
        await deployer.sendTransaction({
            to: deployer.address,
            value: ethers.utils.parseEther("0.1"),
            maxPriorityFeePerGas: 45 * 1e9,
            maxFeePerGas: 35 * 1e9,
        });
        assert(false, "testWrongGasRelatedField#1 failed");
    } catch (error: any) {
        assert(
            error.message.includes("MaxPriorityFeePerGas is greater than MaxFeePerGas"),
            "testWrongGasRelatedField#1 failed"
        );
    }

    // 2. maxFeePerGas is lower than base fee
    try {
        await deployer.sendTransaction({
            to: deployer.address,
            value: ethers.utils.parseEther("0.1"),
            maxPriorityFeePerGas: 1 * 1e9,
            maxFeePerGas: 23 * 1e9,
        });
        assert(false, "testWrongGasRelatedField#2 failed");
    } catch (error: any) {
        assert(
            error.message.includes("invalid gas fee cap. It must be set to value greater than or equal to baseFee"),
            "testWrongGasRelatedField#2 failed"
        );
    }
}

async function testMaxPriorityFeePerGasAfterMagma(deployer: ethers.Wallet) {
    // It returns 0
    const maxPriorityFeePerGasFromProvider = Number(await provider.send("eth_maxPriorityFeePerGas", []));
    assert(maxPriorityFeePerGasFromProvider === 0, "testMaxPriorityFeePerGasAfterMagma failed");
}

async function testGasPriceAfterMagma(deployer: ethers.Wallet) {
    // It returns basefee * 2
    const gasPrice = Number(await provider.send("eth_gasPrice", []));
    assert(gasPrice === basefee * 2, "testGasPriceAfterMagma failed");
}

async function testEthSendTransactionAfterMagma(deployer: ethers.Wallet) {
    //  maxFeePerGas must be higher than basefee
    try {
        await deployer.sendTransaction({
            to: deployer.address,
            value: ethers.utils.parseEther("0.1"),
            maxPriorityFeePerGas: 10 * 1e9,
            maxFeePerGas: 20 * 1e9,
        });
        assert(false, "testEthSendTransactionAfterMagma failed");
    } catch (error: any) {
        assert(
            error.message.includes("invalid gas fee cap. It must be set to value greater than or equal to baseFee"),
            "testEthSendTransactionAfterMagma failed"
        );
    }
}

async function testMaxPriorityFeePerGasAfterEthTxType(deployer: ethers.Wallet) {
    // It returns fixed unit price
    const maxPriorityFeePerGasFromProvider = Number(await provider.send("eth_maxPriorityFeePerGas", []));
    assert(maxPriorityFeePerGasFromProvider === basefee, "testMaxPriorityFeePerGasAfterEthTxType failed");
}

async function testGasPriceAfterEthTxType(deployer: ethers.Wallet) {
    // It returns fixed unit price
    const gasPrice = Number(await provider.send("eth_gasPrice", []));
    assert(gasPrice === basefee, "testGasPriceAfterEthTxType failed");
}

async function testEthSendTransactionAfterEthTxType(deployer: ethers.Wallet) {
    // 1. maxPriorityFeePerGas isn't fixed unit price
    try {
        await deployer.sendTransaction({
            to: deployer.address,
            value: ethers.utils.parseEther("0.1"),
            maxPriorityFeePerGas: 10 * 1e9,
            maxFeePerGas: 25 * 1e9,
        });
        assert(false, "testEthSendTransactionAfterEthTxType failed");
    } catch (error: any) {
        assert(
            error.message.includes("invalid gas tip cap. It must be set to the same value as gas unit price"),
            "testEthSendTransactionAfterEthTxType failed"
        );
    }

    // 2. maxFeePerGas isn't fixed unit price
    try {
        await deployer.sendTransaction({
            to: deployer.address,
            value: ethers.utils.parseEther("0.1"),
            maxPriorityFeePerGas: 25 * 1e9,
            maxFeePerGas: 35 * 1e9,
        });
        assert(false, "testEthSendTransactionAfterEthTxType failed");
    } catch (error: any) {
        assert(
            error.message.includes("invalid gas fee cap. It must be set to the same value as gas unit price"),
            "testEthSendTransactionAfterEthTxType failed"
        );
    }

    // 3. Success case
    const tx = await deployer.sendTransaction({
        to: deployer.address,
        value: ethers.utils.parseEther("0.1"),
        maxPriorityFeePerGas: 25 * 1e9,
        maxFeePerGas: 25 * 1e9,
    });
    const receipt = await tx.wait(1);
    assert(receipt.status === 1, "testEthSendTransactionAfterEthTxType failed");
}

async function testEthSendTransactionBeforeEthTxType(deployer: ethers.Wallet) {
    // It rejects if there're maxPriorityFeePerGas and maxFeePerGas
    try {
        await deployer.sendTransaction({
            to: deployer.address,
            value: ethers.utils.parseEther("0.1"),
            maxPriorityFeePerGas: 10 * 1e9,
            maxFeePerGas: 35 * 1e9,
        });
        assert(false, "testEthSendTransactionBeforeEthTyType failed");
    } catch (error: any) {
        assert(
            error.message.includes("transaction type not supported"),
            "testEthSendTransactionBeforeEthTyType failed"
        );
    }
}

async function testGasPriceBeforeEthTxType(deployer: ethers.Wallet) {
    // It returns fixed unit price
    const gasPrice = Number(await provider.send("eth_gasPrice", []));
    assert(gasPrice === basefee, "testGasPriceBeforeEthTxType failed");
}

async function testMaxPriorityFeePerGasBeforeEthTxType(deployer: ethers.Wallet) {
    // It returns fixed unit price
    const maxPriorityFeePerGasFromProvider = Number(await provider.send("eth_maxPriorityFeePerGas", []));
    assert(maxPriorityFeePerGasFromProvider === basefee, "testMaxPriorityFeePerGasBeforeEthTxType failed");
}
