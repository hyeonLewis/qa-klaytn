import { CnV2Mock__factory } from "../../../typechain-types";
import { ethers } from "ethers";
import { getEnv } from "../../common/utils";
import { provider } from "./main";
import { checkValSet } from "./common";

export async function testValSetForKaiaParent(cns: string[], nodeIds: string[], kaiaHF: number) {
    const env = getEnv();

    const pk = env["PRIVATE_KEY"];
    const deployer = new ethers.Wallet(pk, provider);

    const cnV2 = CnV2Mock__factory.connect(cns[1], deployer);
    let tx = await cnV2.takeOut(ethers.utils.parseEther("4000000"));
    let receipt = await tx.wait(1);

    if (receipt.blockNumber >= kaiaHF - 1) {
        throw new Error("Timing error, please retry");
    }

    const valSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]);
    // Not updated before kaia fork.
    checkValSet(nodeIds, valSet, 4);

    // Wait for the hard fork block
    while ((await provider.getBlockNumber()) < kaiaHF) {
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const valSetAfter = await provider.send("kaia_getCommittee", [kaiaHF]);
    checkValSet(nodeIds, valSetAfter, 3);

    console.log("Test for kaia parent block ended");
}
