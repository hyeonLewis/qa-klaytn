import { impersonateAccount, stopImpersonatingAccount } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import {
  IVoting,
  StakingTrackerV2__factory,
  IVoting__factory,
  IAddressBook__factory,
  ICnStakingV2__factory,
  CLRegistry__factory,
  MockCLPool__factory,
  StakingTrackerV2,
} from "../../typechain-types";
import { nowBlock, setBlock, toBytes32, ADDRESS_BOOK_ADDRESS, REGISTRY_ADDRESS } from "../common/utils";
import { assert } from "console";
import { IRegistry__factory } from "../../typechain-types/factories/src/kip-226/contracts";

const voting = "0xca4ef926634a530f12e55a0aee87f195a7b22aa3";
const secretary = "0x815643D2C645e4cCC39a7Bab3BdB735bEc451899";
const registryOwner = "0x0b3AEeD9E8145AD213A41D6494467095E5152637";
const wrappedKaia = "0x19aac5f612f524b754ca7e7c41cbfa2e981a4432";

async function voteForProposal(votingContract: IVoting, proposalId: number) {
  const [deployer] = await ethers.getSigners();

  const addressBook = IAddressBook__factory.connect(ADDRESS_BOOK_ADDRESS, deployer);

  const [, stakingContracts, , ,] = await addressBook.getAllAddressInfo();

  for (const addr of stakingContracts) {
    const stakingContract = ICnStakingV2__factory.connect(addr, deployer);
    try {
      const voterAddress = await stakingContract.voterAddress();
      await impersonateAccount(voterAddress);
      const voterSigner = await ethers.getSigner(voterAddress);
      if (voterAddress !== ethers.constants.AddressZero) {
        await votingContract.connect(voterSigner).castVote(proposalId, 1);
      }
      await stopImpersonatingAccount(voterAddress);
    } catch (e) {
      // ignore
    }
  }
}

async function updateAllStakingTrackerAndRefreshVoter(stAddr: StakingTrackerV2) {
  const [deployer] = await ethers.getSigners();

  const addressBook = IAddressBook__factory.connect(ADDRESS_BOOK_ADDRESS, deployer);

  const [, stakingContracts, , ,] = await addressBook.getAllAddressInfo();

  for (const addr of stakingContracts) {
    const stakingContract = ICnStakingV2__factory.connect(addr, deployer);
    try {
      const { adminList, requirement } = await getStateOfCnStaking(addr);
      const requestId = await stakingContract.requestCount();
      for (let i = 0; i < Number(requirement); i++) {
        await impersonateAccount(adminList[i]);
        const adminSigner = await ethers.getSigner(adminList[i]);
        if (i == 0) {
          await stakingContract.connect(adminSigner).submitUpdateStakingTracker(stAddr.address);
        } else {
          await stakingContract
            .connect(adminSigner)
            .confirmRequest(requestId, "9", toBytes32(stAddr.address), toBytes32(0), toBytes32(0));
        }
        await stopImpersonatingAccount(adminList[i]);
      }
      await stAddr.refreshVoter(addr);
    } catch (e) {
      // ignore
    }
  }
}

async function getStateOfCnStaking(addr: string) {
  const [deployer] = await ethers.getSigners();
  const stakingContract = ICnStakingV2__factory.connect(addr, deployer);
  const [, , , adminList, requirement, , , ,] = await stakingContract.getState();
  return { adminList, requirement };
}

// Please use forked mainnet to run this script.
// networks: {
//     hardhat: {
//       forking: {
//         url: env?.["CYPRESS_URL"] || "https://archive-en.node.kaia.io",
//         blockNumber: ...
//       },
//       accounts: {
//         accountsBalance: 1_000_000_000n.toString() + "0".repeat(18),
//       },
//     },
//     ...
// }
// export HARDHAT_NETWORK=hardhat

async function main() {
  const [deployer] = await ethers.getSigners();
  await deployer.sendTransaction({
    to: registryOwner,
    value: ethers.utils.parseEther("1"),
  });

  await impersonateAccount(secretary);
  await impersonateAccount(registryOwner);
  const secretarySigner = await ethers.getSigner(secretary);
  const registrySigner = await ethers.getSigner(registryOwner);

  const stakingTrackerV2 = await new StakingTrackerV2__factory(deployer).deploy(voting);
  await stakingTrackerV2.deployed();

  const votingContract = IVoting__factory.connect(voting, secretarySigner);

  // 1. Update StakingTracker of Voting Contract

  let calldata = votingContract.interface.encodeFunctionData("updateStakingTracker", [stakingTrackerV2.address]);
  await votingContract.propose("Replace ST", [votingContract.address], [0], [calldata], 86400, 86400);

  let proposalId = await votingContract.lastProposalId();

  await setBlock((await nowBlock()) + 86400);

  await voteForProposal(votingContract, Number(proposalId));

  await setBlock((await nowBlock()) + 86500);

  await votingContract.queue(proposalId);

  await setBlock((await nowBlock()) + 86400 * 2);

  await votingContract.execute(proposalId);

  assert((await votingContract.stakingTracker()) === stakingTrackerV2.address);

  // 2. Update StakingTracker of CnStakings.

  await updateAllStakingTrackerAndRefreshVoter(stakingTrackerV2);

  // 3. Test new StakingTrackerV2

  calldata = votingContract.interface.encodeFunctionData("updateSecretary", [deployer.address]);
  await votingContract.propose("Update Secretary", [votingContract.address], [0], [calldata], 86400, 86400);

  proposalId = await votingContract.lastProposalId();

  await setBlock((await nowBlock()) + 86400);

  await voteForProposal(votingContract, Number(proposalId));

  await setBlock((await nowBlock()) + 86500);

  await votingContract.queue(proposalId);

  await setBlock((await nowBlock()) + 86400 * 2);

  await votingContract.execute(proposalId);

  assert((await votingContract.secretary()) === deployer.address);

  // Prepare for CLRegistry
  // Testing GCId: 56 (0x74f64cb6c2db9e0b270df1d4e563920381aec034), 83 (0x81513e31072d1cd8ab3b0c5a290e97513f000756)
  const registry = IRegistry__factory.connect(REGISTRY_ADDRESS, registrySigner);
  const clRegistry = await new CLRegistry__factory(registrySigner).deploy(deployer.address);

  const cl1Node = "0x74f64cb6c2db9e0b270df1d4e563920381aec034";
  const cl2Node = "0x81513e31072d1cd8ab3b0c5a290e97513f000756";

  const cl1Addr = await new MockCLPool__factory(deployer).deploy(stakingTrackerV2.address, wrappedKaia);
  const cl2Addr = await new MockCLPool__factory(deployer).deploy(stakingTrackerV2.address, wrappedKaia);

  await clRegistry.connect(deployer).addCLPair([
    {
      gcId: 56,
      nodeId: cl1Node,
      clPool: cl1Addr.address,
      clStaking: cl1Addr.address,
    },
    {
      gcId: 83,
      nodeId: cl2Node,
      clPool: cl2Addr.address,
      clStaking: cl2Addr.address,
    },
  ]);

  await registry.register("CLRegistry", clRegistry.address, (await nowBlock()) + 5);
  await registry.register("WrappedKaia", wrappedKaia, (await nowBlock()) + 5);

  await cl1Addr.deposit({ value: ethers.utils.parseEther("50000000") });
  await cl2Addr.deposit({ value: ethers.utils.parseEther("50000000") });

  await setBlock((await nowBlock()) + 10);

  calldata = votingContract.interface.encodeFunctionData("updateSecretary", [deployer.address]);
  await votingContract
    .connect(deployer)
    .propose("Update Secretary", [votingContract.address], [0], [calldata], 86400, 86400);

  // check tracker
  const [gcBalance, gcVotes] = await stakingTrackerV2.getTrackedGC(2, 56);
  assert(gcBalance.eq(ethers.utils.parseEther("55000000")));
  assert(gcVotes.eq(11));
  const [gcBalance2, gcVotes2] = await stakingTrackerV2.getTrackedGC(2, 83);
  assert(gcBalance2.eq(ethers.utils.parseEther("55000000.5")));
  assert(gcVotes2.eq(11));

  await cl1Addr.withdraw(deployer.address, ethers.utils.parseEther("15000000"));
  const [gcBalance3, gcVotes3] = await stakingTrackerV2.getTrackedGC(2, 56);
  assert(gcBalance3.eq(ethers.utils.parseEther("40000000")));
  assert(gcVotes3.eq(8));

  await stopImpersonatingAccount(secretary);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
