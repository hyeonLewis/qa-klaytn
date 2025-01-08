import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { Wallet } from "ethers";
import hre from "hardhat";

const env = dotenv.config().parsed;

export const ADDRESS_BOOK_ADDRESS = "0x0000000000000000000000000000000000000400";
export const REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000401";

export const getEnv = () => {
  if (!env) {
    throw new Error("No .env file found");
  }
  return env;
};

export async function populateSigners(fundingWallet: Wallet, number: number) {
  const signers = [];
  for (let i = 0; i < number; i++) {
    const signer = Wallet.createRandom();
    await fundingWallet.sendTransaction({
      to: signer.address,
      value: ethers.utils.parseEther("5.0"),
    });
    signers.push(new ethers.Wallet(signer.privateKey, fundingWallet.provider));
  }
  return signers;
}

export async function getHF(key: string) {
  const chainConfig = await hre.network.provider.send("kaia_getChainConfig", []);
  return Number(chainConfig[key]);
}

// Time related
export async function nowBlock() {
  return parseInt(await hre.network.provider.send("eth_blockNumber"));
}

export async function setBlock(num: number) {
  const now = await nowBlock();
  if (now < num) {
    const blocksToMine = "0x" + (num - now).toString(16);
    await hre.network.provider.send("hardhat_mine", [blocksToMine]);
  }
}

export function toBytes32(x: any) {
  try {
    return ethers.utils.hexZeroPad(x, 32).toLowerCase();
    // eslint-disable-next-line no-empty
  } catch {}

  return x;
}
