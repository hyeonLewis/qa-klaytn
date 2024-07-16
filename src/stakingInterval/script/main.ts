import { ethers } from "ethers";
import { testValSet } from "./testStakingInterval";
import { setup } from "./common";
import { testValSetForKaiaParent } from "./testForKaiaParent";

export const url = "http://127.0.0.1:8551";
export const provider = new ethers.providers.JsonRpcProvider(url);

const isTestParent = false;
const waitForHF = false;

async function main() {
    const { kaiaHF, cnList, nodeId } = await setup();
    if (kaiaHF <= 30 && isTestParent) {
        throw new Error("kaiaHF should have buffer when testing parent block");
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (isTestParent) {
        console.log("Test for kaia parent block started");
        console.log("Waiting for hard fork block");
        while ((await provider.getBlockNumber()) < kaiaHF - 15) {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        await testValSetForKaiaParent(cnList, nodeId, kaiaHF);
    } else {
        console.log("Staking interval test started");
        if (waitForHF && kaiaHF !== 0) {
            console.log("Waiting for hard fork block");
            while ((await provider.getBlockNumber()) < kaiaHF) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
        await testValSet(cnList, nodeId, kaiaHF);
    }
    console.log("All Tests Done, check the failed assertions above");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
