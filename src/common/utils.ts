import * as dotenv from "dotenv";
import { ethers } from "ethers";

const env = dotenv.config().parsed;

export const getEnv = () => {
  if (!env) {
    throw new Error("No .env file found");
  }
  return env;
};

export async function populateSigners(fundingWallet: ethers.Wallet, number: number) {
  const signers = [];
  for (let i = 0; i < number; i++) {
    const signer = ethers.Wallet.createRandom();
    await fundingWallet.sendTransaction({
      to: signer.address,
      value: ethers.utils.parseEther("5.0"),
    });
    signers.push(new ethers.Wallet(signer.privateKey, fundingWallet.provider));
  }
  return signers;
}

export async function getHF(provider: ethers.providers.JsonRpcProvider, key: string) {
  const chainConfig = await provider.send("kaia_getChainConfig", []);
  return Number(chainConfig[key]);
}
