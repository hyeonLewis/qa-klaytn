import { assert } from "console";
import { GasPrice, GasPrice__factory } from "../../../typechain-types";
import { ethers } from "ethers";
import { Wallet, JsonRpcProvider } from "@klaytn/ethers-ext";
import { getEnv } from "../../common/utils";

const url = "http://127.0.0.1:8551";

async function deployGasPrice() {
    const env = getEnv();

    const pk = env["PRIVATE_KEY"];
    const provider = new ethers.providers.JsonRpcProvider(url);
    const deployer = new ethers.Wallet(pk, provider);

    const userPk = ethers.Wallet.createRandom().privateKey;
    const user = new ethers.Wallet(userPk, provider);
    const tx = await deployer.sendTransaction({
        to: user.address,
        value: ethers.utils.parseEther("100"),
    });
    await tx.wait(1);

    const gasPrice = await new GasPrice__factory(user).deploy();
    await gasPrice.deployed();

    console.log("GasPrice deployed to:", gasPrice.address);

    return { gasPrice, userPk };
}

async function checkResult(
    gasPrice: GasPrice,
    gasPriceResult: any,
    testCase: any,
    beforeBalance: ethers.BigNumber,
    afterBalance: ethers.BigNumber,
    receipt: any
) {
    // 1. Check the effective gas price
    assert(
        gasPriceResult[0] === testCase.expectedGasPrice,
        `Expected gas price to be ${testCase.expectedGasPrice}, got ${gasPriceResult[0]}`
    );

    // 2. Check the gas tip
    assert(
        gasPriceResult[0] - gasPriceResult[1] === testCase.expectedGasTip,
        `Expected gas tip to be ${testCase.expectedGasTip}, got ${gasPriceResult[0] - gasPriceResult[1]}`
    );

    // 3. Check the receipt
    assert(
        receipt.effectiveGasPrice.eq(testCase.expectedGasPrice),
        `Expected effective gas price to be ${testCase.expectedGasPrice}, got ${receipt.effectiveGasPrice.toString()}`
    );

    // 4. Check the `getTransactionReceipt`
    const txReceipt = await gasPrice.provider.getTransactionReceipt(receipt.transactionHash);
    assert(
        txReceipt.effectiveGasPrice.eq(testCase.expectedGasPrice),
        `Expected effective gas price to be ${testCase.expectedGasPrice}, got ${txReceipt.effectiveGasPrice.toString()}`
    );

    // 5. Check the balance change
    assert(
        beforeBalance.sub(afterBalance).eq(testCase.expectedGasPrice * Number(receipt.gasUsed)),
        `Expected proposer balance to be ${beforeBalance.sub(afterBalance).toString()}, got ${
            testCase.expectedGasPrice * Number(receipt.gasUsed)
        }`
    );

    // 6. Check `getRewards`: TotalFee contains the gas tip
    const jsonProvider = new ethers.providers.JsonRpcProvider(url);
    const rewards = await jsonProvider.send("kaia_getRewards", [receipt.blockNumber]);
    const totalFee = rewards.totalFee;
    assert(
        totalFee === testCase.expectedGasPrice * Number(receipt.gasUsed),
        `Expected totalFee to be ${testCase.expectedGasPrice * Number(receipt.gasUsed)}, got ${totalFee.toString()}`
    );
}

async function testGasPriceForKlaytnType(gasPrice: GasPrice, userPk: string) {
    console.log("Testing for Klaytn type");
    // Note that basefee is 25 gkei.
    // gasPrice - baseFee will be the gas tip.
    const testCases = [
        {
            gasPrice: 26 * 1e9,
            expectedGasPrice: 26 * 1e9,
            expectedGasTip: 1 * 1e9,
        },
        {
            gasPrice: 29 * 1e9,
            expectedGasPrice: 29 * 1e9,
            expectedGasTip: 4 * 1e9,
        },
        {
            gasPrice: 25 * 1e9,
            expectedGasPrice: 25 * 1e9,
            expectedGasTip: 0,
        },
    ];

    for (const testCase of testCases) {
        const beforeBalance = await gasPrice.provider.getBalance(await gasPrice.signer.getAddress());

        const klaytnProvider = new JsonRpcProvider(url);
        const klaytnWallet = new Wallet(userPk, klaytnProvider);

        const result = await klaytnWallet.sendTransaction({
            to: gasPrice.address,
            value: 0,
            gasPrice: testCase.gasPrice,
            data: gasPrice.interface.encodeFunctionData("increaseCount"),
            type: 0x30, // SmartContractExecution
        });
        const receipt = await result.wait(1);

        const gasPriceResult = (await gasPrice.getGasPrice()).map((x) => Number(x));
        // console.log(gasPriceResult);

        await checkResult(
            gasPrice,
            gasPriceResult,
            testCase,
            beforeBalance,
            await gasPrice.provider.getBalance(await gasPrice.signer.getAddress()),
            receipt
        );
    }
}

async function testGasPriceForLegacy(gasPrice: GasPrice) {
    console.log("Testing for legacy");

    // Note that basefee is 25 gkei.
    // gasPrice - baseFee will be the gas tip.
    const testCases = [
        {
            gasPrice: 26 * 1e9,
            expectedGasPrice: 26 * 1e9,
            expectedGasTip: 1 * 1e9,
        },
        {
            gasPrice: 29 * 1e9,
            expectedGasPrice: 29 * 1e9,
            expectedGasTip: 4 * 1e9,
        },
        {
            gasPrice: 25 * 1e9,
            expectedGasPrice: 25 * 1e9,
            expectedGasTip: 0,
        },
    ];

    for (const testCase of testCases) {
        const beforeBalance = await gasPrice.provider.getBalance(await gasPrice.signer.getAddress());

        const result = await gasPrice.increaseCount({
            gasPrice: testCase.gasPrice,
            type: 1,
        });

        const receipt = await result.wait(1);

        const gasPriceResult = (await gasPrice.getGasPrice()).map((x) => Number(x));
        // console.log(gasPriceResult);

        await checkResult(
            gasPrice,
            gasPriceResult,
            testCase,
            beforeBalance,
            await gasPrice.provider.getBalance(await gasPrice.signer.getAddress()),
            receipt
        );
    }
}

async function testGasPriceForType2(gasPrice: GasPrice) {
    console.log("Testing for type 2");

    // Note that basefee is 25 gkei
    const testCases = [
        { maxPriorityFeePerGas: 1 * 1e9, maxFeePerGas: 27 * 1e9, expectedGasPrice: 26 * 1e9, expectedGasTip: 1 * 1e9 },
        { maxPriorityFeePerGas: 2 * 1e9, maxFeePerGas: 27 * 1e9, expectedGasPrice: 27 * 1e9, expectedGasTip: 2 * 1e9 },
        { maxPriorityFeePerGas: 2 * 1e9, maxFeePerGas: 25 * 1e9, expectedGasPrice: 25 * 1e9, expectedGasTip: 0 },
    ];

    for (const testCase of testCases) {
        const beforeBalance = await gasPrice.provider.getBalance(await gasPrice.signer.getAddress());

        const result = await gasPrice.increaseCount({
            maxPriorityFeePerGas: testCase.maxPriorityFeePerGas,
            maxFeePerGas: testCase.maxFeePerGas,
            type: 2,
        });

        const receipt = await result.wait(1);

        const gasPriceResult = (await gasPrice.getGasPrice()).map((x) => Number(x));
        // console.log(gasPriceResult);

        await checkResult(
            gasPrice,
            gasPriceResult,
            testCase,
            beforeBalance,
            await gasPrice.provider.getBalance(await gasPrice.signer.getAddress()),
            receipt
        );
    }
}

async function main() {
    const { gasPrice, userPk } = await deployGasPrice();
    await testGasPriceForType2(gasPrice);
    await testGasPriceForLegacy(gasPrice);
    await testGasPriceForKlaytnType(gasPrice, userPk);

    console.log("All Tests Done, check the failed assertions above");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
