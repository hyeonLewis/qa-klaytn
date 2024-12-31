import { ethers } from "ethers";
import { closeTo, getBalance, provider, setupCLs, setupCNs } from "./common";
import { getEnv, getHF } from "../../common/utils";
import { assert } from "console";
import { CLMock__factory, CNMock__factory } from "../../../typechain-types";

// homi setup --cn-num 4 --baobab --gen-type local --prague-compatible-blocknumber 100 --address-book-mock --registry-mock

class StakingInfoChecker {
  private randomAddr = "0x9c6383F23079b8313d4A5Aaa3137435bbEd178B3"; // For non-existing NodeId for invalid CL
  private proposerReward = ethers.utils.parseEther("0.6528");
  private stakingReward = ethers.utils.parseEther("2.6112");
  private signer: ethers.Wallet;
  private pragueHF: number;
  private cnInfos: { nodeIds: string[]; stakingContracts: string[]; rewards: string[] } = {
    nodeIds: [],
    stakingContracts: [],
    rewards: [],
  };
  private clInfos: { clNodeIds: string[]; clPools: string[]; clRewards: string[] } = {
    clNodeIds: [],
    clPools: [],
    clRewards: [],
  };

  private cnStakingAmounts: string[] = [];
  private clStakingAmounts: number[] = [];

  constructor(signer: ethers.Wallet, pragueHF: number) {
    this.signer = signer;
    this.pragueHF = pragueHF;
  }

  async setup() {
    await this.setupCNs();
    console.log("CNs setup done");
    await this.setupCLs();
    console.log("CLs setup done");
    this.logSetupInfo();
  }

  private logSetupInfo() {
    console.log("--------------------------------");
    console.log("CNs:", this.cnInfos.stakingContracts);
    console.log("Node IDs:", this.cnInfos.nodeIds);
    console.log("Rewards:", this.cnInfos.rewards);
    console.log("--------------------------------");
    console.log("CL Node IDs:", this.clInfos.clNodeIds);
    console.log("CL Pools:", this.clInfos.clPools);
    console.log("CL Stakings:", this.clInfos.clRewards);
    console.log("--------------------------------");
  }

  async setupCNs() {
    const { cnLists, nodeIds, rewards, amounts } = await setupCNs();
    this.cnInfos = {
      nodeIds: nodeIds.map((id: string) => id.toLowerCase()),
      stakingContracts: cnLists.map((addr: string) => addr.toLowerCase()),
      rewards: rewards.map((addr: string) => addr.toLowerCase()),
    };
    this.cnStakingAmounts = amounts.map((amount: ethers.BigNumber) => ethers.utils.formatEther(amount));
  }

  async setupCLs() {
    const { clNodeIds, clPoolLists, clStakingLists, clAmounts } = await setupCLs(
      [...this.cnInfos.nodeIds.slice(0, 2), this.randomAddr],
      this.pragueHF
    );
    this.clInfos = {
      clNodeIds: clNodeIds.map((id: string) => id.toLowerCase()),
      clPools: clPoolLists.map((pool: string) => pool.toLowerCase()),
      clRewards: clStakingLists.map((reward: string) => reward.toLowerCase()),
    };
    this.clStakingAmounts = clAmounts.map((amount: ethers.BigNumber) => Number(ethers.utils.formatEther(amount)));
  }

  async checkGetStakingInfo(bn: number) {
    console.log("Checking getStakingInfo at block: ", bn);
    const stakingInfos = await provider.send("kaia_getStakingInfo", [bn]);
    if (bn >= this.pragueHF) {
      this.checkAddressBookStakingInfo(stakingInfos);
      this.checkCLStakingInfo(stakingInfos);
    } else {
      assert(stakingInfos.clStakingInfos === null, "CL staking info should be null before prague HF");
      this.checkAddressBookStakingInfo(stakingInfos);
    }
  }

  async checkRewardDistribution(bn: number) {
    console.log("Checking reward distribution at block: ", bn);
    const rewards = await provider.send("kaia_getRewards", [bn]);
    const proposerAddr = await this.getProposerAddr(bn);
    if (bn >= this.pragueHF) {
      await this.checkCLRewardDistribution(rewards, proposerAddr, bn);
    } else {
      await this.checkAddressBookRewardDistribution(rewards, proposerAddr, bn);
    }
  }

  async checkRewardDistributionWithRatio(bn: number) {
    console.log("Checking reward distribution with ratio at block: ", bn);

    // Test with CN: 10M, CL: 5M
    const clmock = CLMock__factory.connect(this.clInfos.clPools[1], this.signer);
    const tx = await clmock.takeOut(ethers.utils.parseEther("5000000"));
    const receipt = await tx.wait(1);

    const rewards = await this.getRewardsFromAPI(receipt.blockNumber + 1);
    const proposerAddr = await this.getProposerAddr(receipt.blockNumber + 1);

    const isProposer = proposerAddr === this.cnInfos.nodeIds[1];
    const myStaking = 15_000_000;
    const totalStaking = 60_000_000;
    const blockReward = this.calculateReward(isProposer, myStaking, totalStaking);

    const cnReward = String(rewards[this.cnInfos.rewards[1]]);
    const clReward = String(rewards[this.clInfos.clRewards[1]]);
    assert(closeTo(ethers.BigNumber.from(cnReward), blockReward.mul(2).div(3)), "CN reward mismatch");
    assert(closeTo(ethers.BigNumber.from(clReward), blockReward.div(3)), "CL reward mismatch");

    let beforeBalance = await getBalance(this.cnInfos.rewards[1], receipt.blockNumber);
    let afterBalance = await getBalance(this.cnInfos.rewards[1], receipt.blockNumber + 1);
    assert(closeTo(afterBalance.sub(beforeBalance), blockReward.mul(2).div(3)), "CN reward balance mismatch");

    beforeBalance = await getBalance(this.clInfos.clRewards[1], receipt.blockNumber);
    afterBalance = await getBalance(this.clInfos.clRewards[1], receipt.blockNumber + 1);
    assert(closeTo(afterBalance.sub(beforeBalance), blockReward.div(3)), "CL reward balance mismatch");

    (await clmock.deposit({ value: ethers.utils.parseEther("5000000") })).wait(1);
  }

  async checkValidators(bn: number) {
    console.log("Checking validators at block: ", bn);

    const currValSet = await provider.send("kaia_getCommittee", [bn]);
    assert(currValSet.includes(this.cnInfos.nodeIds[1]), "CN1 should be in the committee");

    const cn1Mock = CNMock__factory.connect(this.cnInfos.stakingContracts[1], this.signer);

    // cn1Mock < minStake will demote cn1Mock
    let tx = await cn1Mock.takeOut(ethers.utils.parseEther("1000000")); // becomes 9M
    let receipt = await tx.wait(1);

    let nextValSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]);
    assert(nextValSet.includes(this.cnInfos.nodeIds[1]), "CN1 shouldn't be demoted yet");

    let rewards = await this.getRewardsFromAPI(receipt.blockNumber + 1);
    assert(Number(rewards[this.cnInfos.rewards[1]]) > 0, "CN1 should have some reward");

    tx = await cn1Mock.takeOut(ethers.utils.parseEther("5000000")); // becomes 4M
    receipt = await tx.wait(1);

    nextValSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]);
    assert(!nextValSet.includes(this.cnInfos.nodeIds[1]), "CN1 should be demoted");

    rewards = await this.getRewardsFromAPI(receipt.blockNumber + 1);
    assert(rewards[this.cnInfos.rewards[1]] === undefined, "CN1 should not have any reward");

    // cn1Mock > minStake will promote cn1Mock
    tx = await cn1Mock.deposit({ value: ethers.utils.parseEther("6000000") }); // becomes 10M
    receipt = await tx.wait(1);

    nextValSet = await provider.send("kaia_getCommittee", [receipt.blockNumber + 1]);
    assert(nextValSet.includes(this.cnInfos.nodeIds[1]), "CN1 should be promoted");

    rewards = await this.getRewardsFromAPI(receipt.blockNumber + 1);
    assert(Number(rewards[this.cnInfos.rewards[1]]) > 0, "CN1 should have some reward");
  }

  async checkValidatorsWithTxFee(bn: number) {
    console.log("Checking validators with tx fee at block: ", bn);

    const txHighFee = await this.signer.sendTransaction({
      to: this.signer.address,
      maxPriorityFeePerGas: 100000 * 1e9, // approx total 2.1 KAIA
      maxFeePerGas: 100000 * 1e9,
      value: ethers.utils.parseEther("0"),
    });
    const receipt = await txHighFee.wait(1);

    const proposerAddr = await this.getProposerAddr(receipt.blockNumber);
    const rewardsFromAPI = await this.getRewardsFromAPI(receipt.blockNumber);
    const { cnIdx, hasCL, clIdx } = this.getIdx(proposerAddr);
    const cnRewardAddr = this.cnInfos.rewards[cnIdx];
    const blockReward = await this.calculateBlockReward(receipt, proposerAddr, receipt.blockNumber);
    if (hasCL) {
      const clRewardAddr = this.clInfos.clRewards[clIdx];
      const cnReward = String(rewardsFromAPI[cnRewardAddr]);
      const clReward = String(rewardsFromAPI[clRewardAddr]);

      assert(closeTo(ethers.BigNumber.from(cnReward), blockReward.div(2)), "CN reward mismatch");
      assert(closeTo(ethers.BigNumber.from(clReward), blockReward.div(2)), "CL reward mismatch");

      let beforeBalance = await getBalance(cnRewardAddr, receipt.blockNumber - 1);
      let afterBalance = await getBalance(cnRewardAddr, receipt.blockNumber);
      assert(closeTo(afterBalance.sub(beforeBalance), blockReward.div(2)), "CN reward balance mismatch");

      beforeBalance = await getBalance(clRewardAddr, receipt.blockNumber - 1);
      afterBalance = await getBalance(clRewardAddr, receipt.blockNumber);
      assert(closeTo(afterBalance.sub(beforeBalance), blockReward.div(2)), "CL reward balance mismatch");
    } else {
      assert(
        closeTo(ethers.BigNumber.from(String(rewardsFromAPI[cnRewardAddr])), blockReward),
        "Proposer reward mismatch"
      );
      const beforeBalance = await getBalance(cnRewardAddr, receipt.blockNumber - 1);
      const afterBalance = await getBalance(cnRewardAddr, receipt.blockNumber);
      assert(closeTo(afterBalance.sub(beforeBalance), blockReward), "Proposer reward balance mismatch");
    }
  }

  private checkCLStakingInfo(stakingInfos: any) {
    const clInfosFromAPI = stakingInfos.clStakingInfos;
    assert(clInfosFromAPI.length === this.clInfos.clNodeIds.length, "CL Node IDs length mismatch");
    assert(clInfosFromAPI.length === this.clInfos.clPools.length, "CL Pools length mismatch");
    assert(clInfosFromAPI.length === this.clInfos.clRewards.length, "CL Rewards length mismatch");
    assert(clInfosFromAPI.length === this.clStakingAmounts.length, "CL Stakings length mismatch");

    for (let i = 0; i < clInfosFromAPI.length; i++) {
      const clInfo = clInfosFromAPI[i];
      assert(this.clInfos.clNodeIds.includes(clInfo.clNodeId), "CL Node ID mismatch");
      assert(this.clInfos.clPools.includes(clInfo.clPoolAddr), "CL Pool mismatch");
      assert(this.clInfos.clRewards.includes(clInfo.clRewardAddr), "CL Reward mismatch");
      assert(this.clStakingAmounts.includes(clInfo.clStakingAmount), "CL Staking mismatch");
    }
  }

  private checkAddressBookStakingInfo(stakingInfos: any) {
    const nodeIdsFromAPI = stakingInfos.councilNodeAddrs;
    const stakingContractsFromAPI = stakingInfos.councilStakingAddrs.map((addr: string) => addr.toLowerCase());
    const rewardsFromAPI = stakingInfos.councilRewardAddrs.map((addr: string) => addr.toLowerCase());
    const stakingAmountsFromAPI = stakingInfos.councilStakingAmounts;

    assert(nodeIdsFromAPI.length === this.cnInfos.nodeIds.length, "Node IDs length mismatch");
    assert(
      stakingContractsFromAPI.length === this.cnInfos.stakingContracts.length,
      "Staking contracts length mismatch"
    );
    assert(rewardsFromAPI.length === this.cnInfos.rewards.length, "Rewards length mismatch");
    assert(stakingAmountsFromAPI.length === this.cnStakingAmounts.length, "Staking amounts length mismatch");

    for (let i = 0; i < this.cnInfos.nodeIds.length; i++) {
      const nodeId = this.cnInfos.nodeIds[i];
      const stakingContract = this.cnInfos.stakingContracts[i];
      const reward = this.cnInfos.rewards[i];
      const stakingAmount = this.cnStakingAmounts[i];

      assert(nodeIdsFromAPI.includes(nodeId), "Node ID mismatch");
      assert(stakingContractsFromAPI.includes(stakingContract), "Staking contract mismatch");
      assert(rewardsFromAPI.includes(reward), "Reward mismatch");
      assert(stakingAmountsFromAPI.includes(Number(stakingAmount)), "Staking amount mismatch");
    }
  }

  private async checkCLRewardDistribution(rewards: any, proposerAddr: string, bn: number) {
    const rewardsFromAPI = rewards.rewards;
    for (let i = 0; i < this.cnInfos.nodeIds.length; i++) {
      const nodeId = this.cnInfos.nodeIds[i];
      const { cnIdx, hasCL, clIdx } = this.getIdx(nodeId);
      const isProposer = nodeId === proposerAddr;
      const cnRewardAddr = this.cnInfos.rewards[cnIdx];
      const myStaking = hasCL
        ? (await this.getCNStakingAmount(bn - 1, this.cnInfos.stakingContracts[i])) +
          (await this.getCLStakingAmount(bn - 1, this.clInfos.clPools[clIdx]))
        : await this.getCNStakingAmount(bn - 1, this.cnInfos.stakingContracts[i]);

      const calculatedReward = this.calculateReward(
        isProposer,
        myStaking,
        (await this.getAllCNStakingAmounts(bn - 1)) + (await this.getAllCLStakingAmounts(bn - 1))
      );

      if (hasCL) {
        const clRewardAddr = this.clInfos.clRewards[clIdx];
        const cnReward = String(rewardsFromAPI[cnRewardAddr]);
        const clReward = String(rewardsFromAPI[clRewardAddr]);

        assert(closeTo(ethers.BigNumber.from(cnReward), calculatedReward.div(2)), "CN reward mismatch");
        assert(closeTo(ethers.BigNumber.from(clReward), calculatedReward.div(2)), "CL reward mismatch");

        let beforeBalance = await getBalance(cnRewardAddr, bn - 1);
        let afterBalance = await getBalance(cnRewardAddr, bn);
        assert(closeTo(afterBalance.sub(beforeBalance), calculatedReward.div(2)), "CN reward balance mismatch");

        beforeBalance = await getBalance(clRewardAddr, bn - 1);
        afterBalance = await getBalance(clRewardAddr, bn);
        assert(closeTo(afterBalance.sub(beforeBalance), calculatedReward.div(2)), "CL reward balance mismatch");
      } else {
        const cnReward = String(rewardsFromAPI[cnRewardAddr]);
        assert(closeTo(ethers.BigNumber.from(cnReward), calculatedReward), "CN reward mismatch");

        const beforeBalance = await getBalance(cnRewardAddr, bn - 1);
        const afterBalance = await getBalance(cnRewardAddr, bn);
        assert(closeTo(afterBalance.sub(beforeBalance), calculatedReward), "CN reward balance mismatch");
      }
    }
  }

  private async checkAddressBookRewardDistribution(rewards: any, proposerAddr: string, bn: number) {
    const rewardsFromAPI = rewards.rewards;

    for (let i = 1; i < this.cnInfos.nodeIds.length; i++) {
      const rewardAddr = this.cnInfos.rewards[i];
      const reward = String(rewardsFromAPI[rewardAddr]);
      const isProposer = this.cnInfos.nodeIds[i] === proposerAddr;
      const calculatedReward = this.calculateReward(
        isProposer,
        await this.getCNStakingAmount(bn - 1, this.cnInfos.stakingContracts[i]),
        await this.getAllCNStakingAmounts(bn - 1)
      );

      assert(closeTo(ethers.BigNumber.from(reward), calculatedReward), "Reward mismatch");

      const beforeBalance = await getBalance(rewardAddr, bn - 1);
      const afterBalance = await getBalance(rewardAddr, bn);
      assert(closeTo(afterBalance.sub(beforeBalance), calculatedReward), "Reward balance mismatch");
    }
  }

  private calculateReward(isProposer: boolean, mystaking: number, totalStaking: number) {
    const totalExcess = totalStaking - 20_000_000;
    let myReward = this.stakingReward.mul(mystaking - 5_000_000).div(totalExcess);
    if (isProposer) {
      myReward = myReward.add(this.proposerReward);
    }
    return myReward;
  }

  private async getCNStakingAmount(bn: number, stakingContract: string) {
    const stakingAmount = await getBalance(stakingContract, bn);
    return Number(ethers.utils.formatEther(stakingAmount));
  }

  private async getCLStakingAmount(bn: number, clPool: string) {
    const stakingAmount = await getBalance(clPool, bn);
    return Number(ethers.utils.formatEther(stakingAmount));
  }

  private async getAllCNStakingAmounts(bn: number) {
    let amount = 0;
    for (let i = 0; i < this.cnInfos.nodeIds.length; i++) {
      const stakingContract = this.cnInfos.stakingContracts[i];
      amount += await this.getCNStakingAmount(bn, stakingContract);
    }
    return amount;
  }

  async getAllCLStakingAmounts(bn: number) {
    let amount = 0;
    // Exclude the last CL pool
    for (let i = 0; i < this.clInfos.clNodeIds.length - 1; i++) {
      const clPool = this.clInfos.clPools[i];
      amount += await this.getCLStakingAmount(bn, clPool);
    }
    return amount;
  }

  private async calculateBlockReward(receipt: any, proposerAddr: string, bn: number) {
    const txFee = ethers.BigNumber.from(String(receipt.effectiveGasPrice * receipt.gasUsed));
    const proposerFee = txFee.div(2).sub(this.proposerReward);

    const { cnIdx, hasCL, clIdx } = this.getIdx(proposerAddr);
    const myStaking = hasCL
      ? (await this.getCNStakingAmount(bn - 1, this.cnInfos.stakingContracts[cnIdx])) +
        (await this.getCLStakingAmount(bn - 1, this.clInfos.clPools[clIdx]))
      : await this.getCNStakingAmount(bn - 1, this.cnInfos.stakingContracts[cnIdx]);
    const totalStaking = (await this.getAllCNStakingAmounts(bn - 1)) + (await this.getAllCLStakingAmounts(bn - 1));
    const baseReward = this.calculateReward(true, myStaking, totalStaking);
    return baseReward.add(proposerFee);
  }

  private async getRewardsFromAPI(bn: number) {
    const rewards = await provider.send("kaia_getRewards", [bn]);
    return rewards.rewards;
  }

  private getIdx(proposerAddr: string) {
    const cnIdx = this.cnInfos.nodeIds.indexOf(proposerAddr);
    const hasCL = this.clInfos.clNodeIds.includes(proposerAddr);
    const clIdx = hasCL ? this.clInfos.clNodeIds.indexOf(proposerAddr) : -1;
    return { cnIdx, hasCL, clIdx };
  }

  private async getProposerAddr(bn: number) {
    return await provider.getBlock(bn).then((block) => block.miner.toLowerCase());
  }
}

async function main() {
  const env = getEnv();
  const pragueHF = await getHF(provider, "pragueCompatibleBlock");
  console.log("pragueHF", pragueHF);
  const signer = new ethers.Wallet(env["PRIVATE_KEY"], provider);
  const checker = new StakingInfoChecker(signer, pragueHF);
  await checker.setup();
  await checker.checkValidators(await provider.getBlockNumber());
  let bn = await provider.getBlockNumber();
  while (bn < pragueHF + 20) {
    await checker.checkGetStakingInfo(bn);
    await checker.checkRewardDistribution(bn);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    bn = await provider.getBlockNumber();
  }
  await checker.checkValidators(bn);

  while (bn < pragueHF + 80) {
    await checker.checkRewardDistributionWithRatio(bn);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    bn = await provider.getBlockNumber();
  }

  while (bn < pragueHF + 180) {
    await checker.checkValidatorsWithTxFee(bn);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    bn = await provider.getBlockNumber();
  }

  console.log("Done");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
