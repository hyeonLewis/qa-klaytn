import { ethers } from "ethers";

const apisWithBlock = [
  "kaia_getCommittee",
  "kaia_getCommitteeSize",
  "kaia_getCouncil",
  "kaia_getCouncilSize",
  "istanbul_getDemotedValidators",
  "istanbul_getValidators",
];

const apisWithBlockHash = [
  "istanbul_getDemotedValidatorsAtHash",
  "istanbul_getValidatorsAtHash",
];

const apisWithComplex = ["kaia_getBlockWithConsensusInfoByNumber"];

const apisWithComplexHash = ["kaia_getBlockWithConsensusInfoByHash"];

const apisWithBlockRange = ["kaia_getBlockWithConsensusInfoByNumberRange"];

const startBlock = 1;
const endBlock = 50;

const v1 = "http://127.0.0.1:8551"; // v1.0.3
const v2 = "http://127.0.0.1:8552"; // v2.0.0

async function main() {
  const v1Provider = new ethers.providers.JsonRpcProvider(v1);
  const v2Provider = new ethers.providers.JsonRpcProvider(v2);

  for (let i = startBlock; i < endBlock; i++) {
    for (const api of apisWithBlock) {
      const v1Result = await v1Provider.send(api, [i]);
      const v2Result = await v2Provider.send(api, [i]);

      if (typeof v1Result === "object") {
        for (const [_, value] of Object.entries(v1Result)) {
          if (!v2Result.includes(value)) {
            console.log(`${api} at block ${i} is different`);
          }
        }
        for (const [_, value] of Object.entries(v2Result)) {
          if (!v1Result.includes(value)) {
            console.log(`${api} at block ${i} is different`);
          }
        }
      } else {
        if (v1Result !== v2Result) {
          console.log(`${api} at block ${i} is different`);
        }
      }
    }
  }

  for (let i = startBlock; i < endBlock; i++) {
    for (const api of apisWithBlockHash) {
      const blockHash = (await v1Provider.getBlock(i)).hash;

      const v1Result = await v1Provider.send(api, [blockHash]);
      const v2Result = await v2Provider.send(api, [blockHash]);

      if (typeof v1Result === "object") {
        for (const [_, value] of Object.entries(v1Result)) {
          if (!v2Result.includes(value)) {
            console.log(`${api} at block ${i} is different`);
          }
        }
        for (const [_, value] of Object.entries(v2Result)) {
          if (!v1Result.includes(value)) {
            console.log(`${api} at block ${i} is different`);
          }
        }
      } else {
        if (v1Result !== v2Result) {
          console.log(`${api} at block ${i} is different`);
        }
      }
    }
  }

  for (let i = startBlock; i < endBlock; i++) {
    for (const api of apisWithComplex) {
      const v1Result = await v1Provider.send(api, [i]);
      const v2Result = await v2Provider.send(api, [i]);

      for (const key of Object.keys(v1Result)) {
        if (key === "committee") {
          const len = v2Result[key].length;
          for (let j = 0; j < len; j++) {
            if (!v1Result[key].includes(v2Result[key][j])) {
              console.log(`${api} at block ${i} is different`);
            }
          }
        } else if (key === "proposer") {
          if (v1Result[key].toString() !== v2Result[key].toString()) {
            console.log(`${api} at block ${i} is different`);
          }
        }
      }
    }
  }

  for (let i = startBlock; i < endBlock; i++) {
    for (const api of apisWithComplexHash) {
      const blockHash = (await v1Provider.getBlock(i)).hash;
      const v1Result = await v1Provider.send(api, [blockHash]);
      const v2Result = await v2Provider.send(api, [blockHash]);

      for (const key of Object.keys(v1Result)) {
        if (key === "committee") {
          const len = v2Result[key].length;
          for (let j = 0; j < len; j++) {
            if (!v1Result[key].includes(v2Result[key][j])) {
              console.log(`${api} at block ${i} is different`);
            }
          }
        } else if (key === "proposer") {
          if (v1Result[key].toString() !== v2Result[key].toString()) {
            console.log(`${api} at block ${i} is different`);
          }
        }
      }
    }
  }

  for (let i = startBlock; i < endBlock - 2; i++) {
    for (const api of apisWithBlockRange) {
      const v1Result = await v1Provider.send(api, [i, i + 2]);
      const v2Result = await v2Provider.send(api, [i, i + 2]);

      const length = Object.keys(v1Result).length;
      for (let j = i; j < length + i; j++) {
        const v1Value = v1Result["0x" + j.toString(16)];
        const v2Value = v2Result["0x" + j.toString(16)];
        for (const key of Object.keys(v1Value)) {
          if (key === "committee") {
            const len = v2Value[key].length;
            for (let j = 0; j < len; j++) {
              if (!v1Value[key].includes(v2Value[key][j])) {
                console.log(`${api} at block ${i} is different`);
              }
            }
          } else if (key === "proposer") {
            if (v1Value[key].toString() !== v2Value[key].toString()) {
              console.log(`${api} at block ${i} is different`);
            }
          }
        }
      }
    }
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
