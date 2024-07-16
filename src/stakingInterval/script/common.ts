import { CnV1Mock__factory, CnV2Mock__factory, AddressBookMock__factory } from "../../../typechain-types";
import { ethers } from "ethers";
import { getEnv } from "../../common/utils";
import { assert } from "console";

const abAddr = "0x0000000000000000000000000000000000000400";

const numCnV1 = 1;
const numCnV2 = 3;

const url = "http://127.0.0.1:8551";
const provider = new ethers.providers.JsonRpcProvider(url);

export async function setup() {
    const chainConfig = await provider.send("kaia_getChainConfig", []);
    const kaiaHF = Number(chainConfig["kaiaCompatibleBlock"]);
    if (kaiaHF !== 0 && !kaiaHF) {
        throw new Error("kaiaCompatibleBlock not found");
    }
    const env = getEnv();

    const nodeId: string[] = [];
    const reward: string[] = [];
    const cnList: string[] = [];

    const pk = env["PRIVATE_KEY"];
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
    const res = await tx.wait(1);

    console.log("CNs registered in AddressBook", res.blockNumber);

    return { kaiaHF, cnList, nodeId };
}

export function checkValSet(nodeIds: string[], valSet: string[], expectedNumber: number) {
    assert(valSet.length === expectedNumber, "Number of validators is incorrect");
    for (const val of valSet) {
        assert(nodeIds.includes(val), "Validator is not in the list");
    }
}
