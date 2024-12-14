import {
  AddressBookMock__factory,
  CLMock__factory,
  CLRegistryMock__factory,
  CNMock__factory,
  IRegistry__factory,
  WrappedKaiaMock__factory,
} from "../../../typechain-types";
import { ethers } from "ethers";
import { getEnv } from "../../common/utils";

const abAddr = "0x0000000000000000000000000000000000000400";
const registryAddr = "0x0000000000000000000000000000000000000401";
const numCN = 4;
const numCL = 3;
export const url = "http://127.0.0.1:8551";
export const provider = new ethers.providers.JsonRpcProvider(url);

// Tricky function to get balance at a specific block number using provider.send
export async function getBalance(address: string, blockNumber: number) {
  const balance = await provider.send("eth_getBalance", [address, blockNumber]);
  return ethers.BigNumber.from(balance);
}

export function closeTo(a: ethers.BigNumber, b: ethers.BigNumber) {
  let delta;
  if (a > b) {
    delta = a.sub(b);
  } else {
    delta = b.sub(a);
  }
  if (delta.gt(ethers.BigNumber.from(10).pow(3))) {
    console.log("Delta: ", delta);
    console.log("A: ", a);
    console.log("B: ", b);
  }
  return delta.lt(ethers.BigNumber.from(10).pow(3));
}

export async function setupCNs() {
  const env = getEnv();

  const nodeIds: string[] = [];
  // Fresh reward addresses for CNs
  const rewards: string[] = [
    "0x1FfdEE22FA4Df55d66dEA1D9435343bE2C0d3B12",
    "0xf411483d602620203BBfC9bA87E38bcfB6430b90",
    "0x2836a57c4fc95537ba2C3B1587D2A7d195a278e6",
    "0x6b4679e1a0AA81ffcab3E0B70044b3c0928b7f44",
  ];
  const cnLists: string[] = [];
  const amounts: ethers.BigNumber[] = ["5000000", "10000000", "15000000", "20000000"].map((amount) =>
    ethers.utils.parseEther(amount)
  );

  const pk = env["PRIVATE_KEY"];
  const deployer = new ethers.Wallet(pk, provider);

  // Staking:
  // 5M, 10M, 15M, 20M
  for (let i = 0; i < numCN; i++) {
    const id = env[`CN${i}`];
    if (!id) {
      throw new Error("CN environment variable not set");
    }
    const cn = await new CNMock__factory(deployer).deploy({
      value: amounts[i],
    });
    nodeIds.push(id);
    cnLists.push(cn.address);
  }

  const addressBook = AddressBookMock__factory.connect(abAddr, deployer);
  let tx = await addressBook.constructContract([deployer.address], 1);
  await tx.wait(1);

  tx = await addressBook.mockRegisterCnStakingContracts(nodeIds, cnLists, rewards);
  await tx.wait(1);

  tx = await addressBook.updateKirContract(env["KIR_CONTRACT"], 1);
  tx = await addressBook.updatePocContract(env["POC_CONTRACT"], 1);
  await tx.wait(1);

  tx = await addressBook.activateAddressBook();
  await tx.wait(1);

  return { cnLists, nodeIds, rewards, amounts };
}

export async function setupCLs(clNodeIds: string[], pragueHF: number) {
  const env = getEnv();
  const pk = env["PRIVATE_KEY"];
  const deployer = new ethers.Wallet(pk, provider);
  const clPoolLists: string[] = [];
  const clStakingLists: string[] = [
    "0x10FD8Bf375208E62077016d58329D2986eED45Ce",
    "0x7B056BaFBDdb86dE6090AFb572880d34451a46D0",
    "0x3F7DAbace014a602C25F610b411EC8875aE08002",
  ];
  const clAmounts: ethers.BigNumber[] = ["5000000", "10000000", "15000000"].map((amount) =>
    ethers.utils.parseEther(amount)
  );
  // 5M, 10M, 15M
  for (let i = 0; i < numCL; i++) {
    const cl = await new CLMock__factory(deployer).deploy({
      value: clAmounts[i],
    });
    clPoolLists.push(cl.address);
  }

  const clRegistry = await new CLRegistryMock__factory(deployer).deploy();
  for (let i = 0; i < numCL; i++) {
    const gcId = i + 1;
    await clRegistry.addCLPair([
      {
        nodeId: clNodeIds[i],
        gcId: gcId,
        clPool: clPoolLists[i],
        clStaking: clStakingLists[i],
      },
    ]);
  }
  const wrappedKaia = await new WrappedKaiaMock__factory(deployer).deploy();

  const registry = IRegistry__factory.connect(registryAddr, deployer);
  const tx = await registry.register("CLRegistry", clRegistry.address, pragueHF);
  const tx2 = await registry.register("WrappedKaia", wrappedKaia.address, pragueHF);
  await tx.wait(1);
  await tx2.wait(1);

  return { clNodeIds, clPoolLists, clStakingLists, clAmounts };
}
