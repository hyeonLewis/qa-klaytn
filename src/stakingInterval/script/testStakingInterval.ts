import { assert } from "console";
import { CnV2Mock__factory } from "../../../typechain-types";
import { ethers } from "ethers";
import { getEnv } from "../../common/utils";
import { provider } from "./main";
import { checkValSet } from "./common";

export async function testValSet(cns: string[], nodeIds: string[], kaiaHF: number) {
    const env = getEnv();

    const pk = env["PRIVATE_KEY"];
    const deployer = new ethers.Wallet(pk, provider);

    let valSet: string[] = [];

    // Current validators stake:
    // 6M, 8M, 16M, 24M.
    // validators: [1: govNode, 2, 3, 4]

    // 1. Demote/Promote validator 2 by withdrawing & depositing 4M.
    // 2. Gradually withdrawing all stakes from all validators -> all council members will be validators.
    //
    // If the current block is less than the hard fork block, the number of validators should not change.

    // 1. Demote/Promote validator 2 by withdrawing & depositing 4M.
    const cnV2 = CnV2Mock__factory.connect(cns[1], deployer);
    let tx = await cnV2.takeOut(ethers.utils.parseEther("4000000"));
    let receipt = await tx.wait(1);

    valSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]); // Council contains demoted validators.
    console.log("valSet #1", valSet, receipt.blockNumber);
    if (receipt.blockNumber + 1 < kaiaHF) {
        checkValSet(nodeIds, valSet, 4);
    } else {
        checkValSet(nodeIds, valSet, 3);
    }

    tx = await cnV2.deposit({ value: ethers.utils.parseEther("4000000") });
    receipt = await tx.wait(1);

    valSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]);
    console.log("valSet #2", valSet, receipt.blockNumber);
    if (receipt.blockNumber + 1 < kaiaHF) {
        checkValSet(nodeIds, valSet, 4);
    } else {
        checkValSet(nodeIds, valSet, 4);
    }

    // 2. Gradually withdrawing all stakes from all validators -> since govNode is not staking, all council members will be validators.
    for (let i = cns.length - 1; i >= 0; i--) {
        const cn = CnV2Mock__factory.connect(cns[i], deployer);
        tx = await cn.takeOut(await provider.getBalance(cns[i]));
        receipt = await tx.wait(1);
        valSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]);
        if (i !== 0) {
            if (receipt.blockNumber + 1 < kaiaHF) {
                checkValSet(nodeIds, valSet, 4);
            } else {
                checkValSet(nodeIds, valSet, i);
            }
        }
    }
    console.log("valSet #3", valSet, receipt.blockNumber);
    checkValSet(nodeIds, valSet, 4);

    console.log("Staking interval test ended");
}
