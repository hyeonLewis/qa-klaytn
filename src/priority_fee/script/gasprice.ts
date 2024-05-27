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

    return { gasPrice, deployer, userPk };
}

async function checkResult(
    gasPrice: GasPrice,
    gasPriceResult: any,
    testCase: any,
    beforeBalance: ethers.BigNumber,
    afterBalance: ethers.BigNumber,
    proposerBeforeBalance: ethers.BigNumber,
    proposerAfterBalance: ethers.BigNumber,
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

    // 5. Check the sender's balance change
    assert(
        beforeBalance.sub(afterBalance).eq(testCase.expectedGasPrice * Number(receipt.gasUsed)),
        `Expected sender balance to be ${testCase.expectedGasPrice * Number(receipt.gasUsed)}, got ${beforeBalance
            .sub(afterBalance)
            .toString()}`
    );

    // 6. Check the proposer's balance change (mining reward)
    // All fees are burnt.
    assert(
        proposerAfterBalance.sub(proposerBeforeBalance).eq(ethers.utils.parseEther("9.6")),
        `Expected proposer balance to be ${ethers.utils.parseEther("9.6")}, got ${proposerAfterBalance
            .sub(proposerBeforeBalance)
            .toString()}`
    );

    // 7. Check `getRewards`: TotalFee contains the gas tip
    const jsonProvider = new ethers.providers.JsonRpcProvider(url);
    const rewards = await jsonProvider.send("kaia_getRewards", [receipt.blockNumber]);
    const totalFee = rewards.totalFee;
    assert(
        totalFee === testCase.expectedGasPrice * Number(receipt.gasUsed),
        `Expected totalFee to be ${testCase.expectedGasPrice * Number(receipt.gasUsed)}, got ${totalFee.toString()}`
    );
}

async function testProposerReward(gasPrice: GasPrice, deployer: ethers.Wallet) {
    console.log("Testing proposer reward");

    // Make effective gas price 20000 gkei
    const maxFeePerGas = 20000 * 1e9;
    const maxPriorityFeePerGas = 19975 * 1e9;

    const proposerBeforeBalance = await deployer.getBalance();

    const result = await gasPrice.increaseCount({
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        maxFeePerGas: maxFeePerGas,
    });
    const receipt = await result.wait(1);

    const proposerAfterBalance = await deployer.getBalance(receipt.blockNumber);

    // Assume reward ratio: 1) "34/54/12" and 2) "20/80".
    //
    // By kore hardfork, if proposer reward will be burnt if smaller than tx fee reward.
    // rewardFee = (maxFeePerGas * gasUsed / 2) - 9.6 * 0.34 * 0.2
    // burntFee = (maxFeePerGas * gasUsed / 2) + 9.6 * 0.34 * 0.2
    // Total Proposer Reward = 9.6 KAIA + rewardFee
    //
    // Please note that the propose reward only cares the ratio, but not the actual distribution.
    // For example, in this test, the proposer will get 9.6 KAIA, not 0.6528 KAIA since there're no stakers.

    const proposerAmount = ethers.utils.parseEther("0.6528");
    const expectedRewardFee = receipt.gasUsed.mul(maxFeePerGas).div(2).sub(proposerAmount);
    const expectedBurntFee = receipt.gasUsed.mul(maxFeePerGas).div(2).add(proposerAmount);
    const expectedProposerReward = expectedRewardFee.add(ethers.utils.parseEther("9.6"));

    // 1. Check proposer reward
    assert(
        proposerAfterBalance.sub(proposerBeforeBalance).eq(expectedProposerReward),
        `Expected proposer balance to be ${expectedProposerReward}, got ${proposerAfterBalance.sub(
            proposerBeforeBalance
        )}`
    );

    // 2. Check `getRewards`: totalFee, burntFee
    const jsonProvider = new ethers.providers.JsonRpcProvider(url);
    const rewards = await jsonProvider.send("kaia_getRewards", [receipt.blockNumber]);
    const totalFee = rewards.totalFee;
    const burntFee = rewards.burntFee;

    assert(
        totalFee === Number(receipt.gasUsed.mul(maxFeePerGas)),
        `Expected totalFee to be ${receipt.gasUsed.mul(maxFeePerGas)}, got ${totalFee.toString()}`
    );
    assert(
        burntFee === Number(expectedBurntFee),
        `Expected burntFee to be ${expectedBurntFee}, got ${burntFee.toString()}`
    );
}
async function testGasPriceForKlaytnType(gasPrice: GasPrice, deployer: ethers.Wallet, userPk: string) {
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
        const proposerBeforeBalance = await deployer.getBalance();

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
            proposerBeforeBalance,
            await deployer.getBalance(receipt.blockNumber),
            receipt
        );
    }
}

async function testGasPriceForLegacy(gasPrice: GasPrice, deployer: ethers.Wallet) {
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
        const proposerBeforeBalance = await deployer.getBalance();

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
            proposerBeforeBalance,
            await deployer.getBalance(receipt.blockNumber),
            receipt
        );
    }
}

async function testGasPriceForType2(gasPrice: GasPrice, deployer: ethers.Wallet) {
    console.log("Testing for type 2");

    // Note that basefee is 25 gkei
    const testCases = [
        { maxPriorityFeePerGas: 1 * 1e9, maxFeePerGas: 27 * 1e9, expectedGasPrice: 26 * 1e9, expectedGasTip: 1 * 1e9 },
        { maxPriorityFeePerGas: 2 * 1e9, maxFeePerGas: 27 * 1e9, expectedGasPrice: 27 * 1e9, expectedGasTip: 2 * 1e9 },
        { maxPriorityFeePerGas: 2 * 1e9, maxFeePerGas: 25 * 1e9, expectedGasPrice: 25 * 1e9, expectedGasTip: 0 },
    ];

    for (const testCase of testCases) {
        const beforeBalance = await gasPrice.provider.getBalance(await gasPrice.signer.getAddress());
        const proposerBeforeBalance = await deployer.getBalance();

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
            proposerBeforeBalance,
            await deployer.getBalance(receipt.blockNumber),
            receipt
        );
    }
}

async function main() {
    const { gasPrice, deployer, userPk } = await deployGasPrice();

    await testGasPriceForType2(gasPrice, deployer);
    await testGasPriceForLegacy(gasPrice, deployer);
    await testGasPriceForKlaytnType(gasPrice, deployer, userPk);

    // Test for the rewardFee > proposerFee
    await testProposerReward(gasPrice, deployer);

    console.log("All Tests Done, check the failed assertions above");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
