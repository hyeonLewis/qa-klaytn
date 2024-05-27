import { GasPrice__factory } from "../../../typechain-types";
import { ethers } from "ethers";
import { getEnv } from "../../common/utils";
import { testGasPriceForKlaytnType, testGasPriceForLegacy, testGasPriceForType2, testProposerReward } from "./gasprice";
import { testTxSortingByGasTip } from "./tx_sorting";

const url = "http://127.0.0.1:8552";

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

async function main() {
    const { gasPrice, deployer, userPk } = await deployGasPrice();

    /// General tests related to priority fee
    // await testGasPriceForType2(gasPrice, deployer);
    // await testGasPriceForLegacy(gasPrice, deployer);
    // await testGasPriceForKlaytnType(gasPrice, deployer, userPk);

    // // Test for the rewardFee > proposerFee
    // await testProposerReward(gasPrice, deployer);

    /// Test for the tx sorting
    await testTxSortingByGasTip(gasPrice, deployer);
    console.log("All Tests Done, check the failed assertions above");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
