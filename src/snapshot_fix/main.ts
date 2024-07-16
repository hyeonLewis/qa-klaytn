import hre from "hardhat";
import { setup } from "../stakingInterval/script/common";

// block number
const APIListArgNumber = [
    "kaia_getStakingInfo",
    "kaia_getRewards",
    "kaia_getCouncil",
    "kaia_getCouncilSize",
    "kaia_getCommittee",
    "kaia_getCommitteeSize",
    "istanbul_getSnapshot",
    "istanbul_getValidators",
    "istanbul_getDemotedValidators",
    "kaia_getBlockWithConsensusInfoByNumber",
];
// block hash
const APIListArgHash = [
    "istanbul_getSnapshotAtHash",
    "istanbul_getValidatorsAtHash",
    "istanbul_getDemotedValidatorsAtHash",
];
// start, end
const APIListArgRange = ["governance_getRewardsAccumulated", "kaia_getBlockWithConsensusInfoByNumberRange"];

async function main() {
    const { ethers } = hre;
    // Only for homi network
    if (hre.network.name === "homi") {
        await setup();
    }

    const errorAPIs = [];

    const currentBlock = await ethers.provider.getBlock("latest");
    const latestStatefulBlockNumber = currentBlock.number - (currentBlock.number % 128);
    const latestStatefulBlock = await ethers.provider.getBlock(latestStatefulBlockNumber - 5);

    // 1. APIListArgNumber
    for (const api of APIListArgNumber) {
        try {
            console.log(
                "Result of ",
                api,
                "at ",
                latestStatefulBlock.number,
                " : ",
                await ethers.provider.send(api, [latestStatefulBlock.number])
            );
        } catch (error) {
            console.log("Error in ", api, " : ", error);
            errorAPIs.push(api);
        }
    }

    // 2. APIListArgHash
    for (const api of APIListArgHash) {
        try {
            console.log(
                "Result of ",
                api,
                "at ",
                latestStatefulBlock.number,
                " : ",
                await ethers.provider.send(api, [latestStatefulBlock.hash])
            );
        } catch (error) {
            console.log("Error in ", api, " : ", error);
            errorAPIs.push(api);
        }
    }

    // 3. APIListArgRange
    for (const api of APIListArgRange) {
        try {
            console.log(
                "Result of ",
                api,
                "at ",
                latestStatefulBlock.number,
                " to ",
                latestStatefulBlock.number,
                " : ",
                await ethers.provider.send(api, [latestStatefulBlockNumber + 1, latestStatefulBlockNumber + 1])
            );
        } catch (error) {
            console.log("Error in ", api, " : ", error);
            errorAPIs.push(api);
        }
    }

    console.log("Total error APIs : ", errorAPIs);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
