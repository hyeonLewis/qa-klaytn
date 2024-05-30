import { assert } from "console";
import { CnV1Mock__factory, CnV2Mock__factory, AddressBookMock__factory } from "../../../typechain-types";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { getEnv } from "../../common/utils";

const abAddr = "0x0000000000000000000000000000000000000400";

const numCnV1 = 1;
const numCnV2 = 3;

const url = "http://127.0.0.1:8551";

async function testValSet(cns: string[], nodeIds: string[]) {
    const env = getEnv();

    const pk = env["PRIVATE_KEY"];
    const provider = new ethers.providers.JsonRpcProvider(url);
    const deployer = new ethers.Wallet(pk, provider);

    let valSet: string[] = [];

    // Current validators stake:
    // 6M, 8M, 16M, 24M.
    // validators: [1: govNode, 2, 3, 4]

    // 1. Demote/Promote validator 2 by withdrawing & depositing 4M.
    // 2. Gradually withdrawing all stakes from all validators -> all council members will be validators.

    // 1. Demote/Promote validator 2 by withdrawing & depositing 4M.
    const cnV2 = CnV2Mock__factory.connect(cns[1], deployer);
    let tx = await cnV2.takeOut(ethers.utils.parseEther("4000000"));
    let receipt = await tx.wait(1);

    valSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]); // Council contains demoted validators.
    console.log("valSet #1", valSet);
    assert(valSet.length === 3, "Demote failed");
    for (const val of valSet) {
        assert(nodeIds.includes(val), "Demote failed");
    }

    tx = await cnV2.deposit({ value: ethers.utils.parseEther("4000000") });
    receipt = await tx.wait(1);

    valSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]);
    console.log("valSet #2", valSet);
    assert(valSet.length === 4, "Promote failed");
    for (const val of valSet) {
        assert(nodeIds.includes(val), "Promote failed");
    }

    // 2. Gradually withdrawing all stakes from all validators -> since govNode is not staking, all council members will be validators.
    for (let i = 0; i < 4; i++) {
        const cn = CnV2Mock__factory.connect(cns[i], deployer);
        tx = await cn.takeOut(await provider.getBalance(cns[i]));
        receipt = await tx.wait(1);
    }

    valSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]);
    console.log("valSet #3", valSet);
    assert(valSet.length === 4, "Withdraw failed");
    for (const val of valSet) {
        assert(nodeIds.includes(val), "Withdraw failed");
    }

    console.log("Staking interval test ended");
}

async function setup() {
    const env = getEnv();

    const nodeId: string[] = [];
    const reward: string[] = [];
    const cnList: string[] = [];

    const pk = env["PRIVATE_KEY"];
    const provider = new ethers.providers.JsonRpcProvider(url);
    const deployer = new ethers.Wallet(pk, provider);

    // Staking:
    // V1: 6M
    // V2: 8M, 16M, 24M

    for (let i = 0; i < numCnV1; i++) {
        const id = env[`CNV1_${i}`];
        if (!id) {
            throw new Error("CN environment variable not set");
        }
        const cnV1 = await new CnV1Mock__factory(deployer).deploy({ value: ethers.utils.parseEther("6000000") });
        nodeId.push(id);
        reward.push(id);
        cnList.push(cnV1.address);
    }
    for (let i = 0; i < numCnV2; i++) {
        const id = env[`CNV2_${i}`];
        if (!id) {
            throw new Error("CN environment variable not set");
        }
        const cnV2 = await new CnV2Mock__factory(deployer).deploy({
            value: ethers.utils.parseEther((8000000n * (BigInt(i) + 1n)).toString()),
        });
        nodeId.push(id);
        reward.push(id);
        cnList.push(cnV2.address);
    }
    console.log("CNs deployed");
    console.log("CN addresses:", cnList);

    const addressBook = AddressBookMock__factory.connect(abAddr, deployer);
    let tx = await addressBook.constructContract([deployer.address], 1);
    await tx.wait(1);

    tx = await addressBook.mockRegisterCnStakingContracts(nodeId, cnList, reward);
    await tx.wait(1);

    tx = await addressBook.updateKirContract(env["KIR_CONTRACT"], 1);
    tx = await addressBook.updatePocContract(env["POC_CONTRACT"], 1);
    await tx.wait(1);

    tx = await addressBook.activateAddressBook();
    await tx.wait(1);

    console.log("CNs registered in AddressBook");

    return { cnList, nodeId };
}

async function main() {
    const { cnList, nodeId } = await setup();

    await new Promise((resolve) => setTimeout(resolve, 5000));

    await testValSet(cnList, nodeId);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
