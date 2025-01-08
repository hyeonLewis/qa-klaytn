import { ethers } from "ethers";
import { TxType, AccountKeyType } from "@kaiachain/js-ext-core";
import { Wallet, JsonRpcProvider } from "@kaiachain/ethers-ext";
import { Delegation__factory, Delegation } from "../../typechain-types";
import { getHF } from "../common/utils";
import { getEnv } from "../common/utils";
import { assert } from "console";
import { computePublicKey } from "ethers/lib/utils";
import { genAccountUpdateRelatedTx, genSmartContractExecutionRelatedTx, genValueTransferRelatedTx } from "./genTx";

export const url = "http://127.0.0.1:8551";
export const provider = new JsonRpcProvider(url);

// This test is for EIP-7702 (KIP-228).
// Checklist:
// - [x] SetCodeTx. (sendRawTransaction, getTransactionReceipt)
//   - #setup
//   - #testSetCodeAfterAccountUpdate
// - [x] APIs: kaia_getAccount, kaia_isContractAccount.
//   - #testCode
// - [x] Opcodes: EXTCODESIZE, EXTCODECOPY, EXTCODEHASH, CALL, DELEGATECALL (CALLCODE), STATICCALL.
//   - #testExecution
// - [x] Reset code of delegation contract to zero address.
//   - #reset
// - [x] Interaction with other tx types.
//   - `to` must be EOA without code.
//     - [x] TxTypeValueTransfer
//     - [x] TxTypeFeeDelegatedValueTransfer
//     - [x] TxTypeFeeDelegatedValueTransferWithRatio
//     - [x] TxTypeValueTransferMemo
//     - [x] TxTypeFeeDelegatedValueTransferMemo
//     - [x] TxTypeFeeDelegatedValueTransferMemoWithRatio
//   - `from` must be EOA without code.
//     - [x] TxTypeAccountUpdate
//     - [x] TxTypeFeeDelegatedAccountUpdate
//     - [x] TxTypeFeeDelegatedAccountUpdateWithRatio
//   - `to` must be EOA with code.
//     - [x] TxTypeSmartContractExecution
//     - [x] TxTypeFeeDelegatedSmartContractExecution
//     - [x] TxTypeFeeDelegatedSmartContractExecutionWithRatio

// homi setup --cn-num 1 --baobab --gen-type local

class TestEIP7702 {
  private signer: Wallet;
  private eoaWithCode: Wallet; // 0xAa3D17D2a89D79c8d7E3e11406C49d21d468d7F2
  private eoaWithoutCode: Wallet;

  // Will be initialized in setup()
  private eoaWithCodeInstance!: Delegation;
  private delegation!: Delegation; // 0xE9f00C100f34DecAF94297132ab80AeE2E4c5B66
  private codeHash: string = "";

  constructor(signer: Wallet, eoaWithCode: Wallet, eoaWithoutCode: Wallet) {
    this.signer = signer;
    this.eoaWithCode = eoaWithCode;
    this.eoaWithoutCode = eoaWithoutCode;
  }

  async setup() {
    await this.signer.sendTransaction({
      to: this.eoaWithCode.address,
      value: ethers.utils.parseEther("1"),
    });
    await this.signer.sendTransaction({
      to: this.eoaWithoutCode.address,
      value: ethers.utils.parseEther("1"),
    });

    this.delegation = await new Delegation__factory(this.signer).deploy();

    await this.waitTime(2000);

    // This is the pre-calculated tx data for SetCodeTx.
    // It'll set the code ofr delegation contract to eoaWithCode.
    const tx = await provider.send("kaia_sendRawTransaction", [
      "0x7804f8ca8203e88014850ba43b74008307a12094aa3d17d2a89d79c8d7e3e11406c49d21d468d7f28080c0f85ef85c8203e894e9f00c100f34decaf94297132ab80aee2e4c5b660180a06a7a860c945a15e7585865470bf642bae57bf452569c3966a8c998d31cbcbdfca0588cf1a59f054cc0aa1984ba1bde50559babfdc04246de0afdcbb69a5950a4c501a099fc603660eaf05f62b53ed05e5a1f8113e97c26e1c93f290dea3930633a38cda023e90c6627b440ed147ff98dc2d5ec4c3aa817615b7cd459f1bdeabeb134c27c",
    ]);

    await this.waitTime(2000);

    const receipt = await provider.send("kaia_getTransactionReceipt", [tx]);
    assert(receipt.type === "TxTypeEthereumSetCode", "SetCodeTx type mismatch");
    assert(receipt.typeInt === 30724, "SetCodeTx type mismatch");
    assert(receipt.authorizationList[0].chainId === 1000, "Authorization list chainId mismatch");
    assert(
      receipt.authorizationList[0].address.toLowerCase() === this.delegation.address.toLowerCase(),
      "Authorization list address mismatch"
    );
    assert(receipt.authorizationList[0].nonce === 1, "Authorization list nonce mismatch");

    this.codeHash = ethers.utils.keccak256("0xef0100" + this.delegation.address.slice(2));

    this.eoaWithCodeInstance = Delegation__factory.connect(this.eoaWithCode.address, this.signer);
  }

  async reset() {
    console.log("Resetting code of delegation contract to zero address");

    // Reset the code of delegation contract to zero address.
    await provider.send("kaia_sendRawTransaction", [
      "0x7804f8ca8203e80214850ba43b74008307a12094aa3d17d2a89d79c8d7e3e11406c49d21d468d7f28080c0f85ef85c8203e89400000000000000000000000000000000000000000380a040c039cf9b3b7bafab4d6c89f6fdfdb13aaac0c87b397d0653acd2c2eebc778da026587fe847d141eb62d2caf64cec8951989a3a23b2bdba24ba651963ecb2a6c901a09ed01013dc7fef57cfd3e99fb52829c084612f5aec22890553653d025e9fa29ea038aa9687a6c7c438cb9fd79345533be45b7ab148a1ac1fe41e9a24d3e10303c7",
    ]);

    await this.waitTime(2000);
  }

  /***************** TEST FUNCTIONS *****************/

  async testCode(isEmpty = false) {
    console.log("Checking code", this.eoaWithCode.address, isEmpty ? "after reset" : "after set");

    const codeFields = await this.getCodeFieldsOfEoaWithCode();
    const code = (await provider.getCode(this.eoaWithCode.address)).toLowerCase();
    const accountInfo = await this.getAccountInfo(this.eoaWithCode.address);
    const isContract = await this.isContractAccount(this.eoaWithCode.address);

    // Account type should be 1 regardless of the code.
    assert(accountInfo.accType === 1, "accType mismatch");
    if (isEmpty) {
      assert(code === "0x", "Code mismatch");
      assert(accountInfo.account.vmVersion === 0, "vmVersion mismatch");
      assert(!isContract, "isContract mismatch");
      const emptyCodeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(""));
      const emptyCodeHashBase64 = Buffer.from(emptyCodeHash.slice(2), "hex").toString("base64");
      assert(accountInfo.account.codeHash === emptyCodeHashBase64, "codeHash mismatch");

      assert(codeFields[0] === "0x", "Code mismatch");
      assert(codeFields[1] === emptyCodeHash, "Codehash mismatch");
      assert(codeFields[2].eq(0), "Size mismatch");
    } else {
      assert(code === "0xef0100" + this.delegation.address.slice(2).toLowerCase(), "Code mismatch");
      assert(accountInfo.account.vmVersion === 1, "vmVersion mismatch");
      assert(isContract, "isContract mismatch");
      assert(
        accountInfo.account.codeHash === Buffer.from(this.codeHash.slice(2), "hex").toString("base64"),
        "codeHash mismatch"
      );

      const codeOfDelegation = await provider.getCode(this.delegation.address);
      assert(codeFields[0] === codeOfDelegation, "Code mismatch");
      assert(
        codeFields[1].toLowerCase() === ethers.utils.keccak256(codeOfDelegation).toLowerCase(),
        "Codehash mismatch"
      );
      // Exclude the 0x prefix
      assert(codeFields[2].eq((codeOfDelegation.length - 2) / 2), "Size mismatch");
    }
  }

  async testExecution() {
    console.log("Checking execution of eoaWithCode");

    await this.testIncrement();
    await this.testCallIncrement();
    await this.testCallIncrementFromEoaWithCode();
    await this.testDelegatecallIncrement();
    await this.testDelegatecallIncrementFromEoaWithCode();
    await this.testCallcodeIncrement();
    await this.testCallcodeIncrementFromEoaWithCode();
  }

  async testKaiaTypeTxs(isSetCode = true) {
    await this.testToMustBeEoaWithoutCode(isSetCode);
    await this.testFromMustBeEoaWithoutCode(isSetCode);
    await this.testToMustBeEoaWithCodeOrSCA(isSetCode);
  }

  async testSetCodeAfterAccountUpdate() {
    console.log("Checking setCode after account update");

    // Since the account key has been updated to public type, the authorizationList will be ignored.
    try {
      await provider.send("kaia_sendRawTransaction", [
        "0x7804f8ca8203e80714850ba43b74008307a12094aa3d17d2a89d79c8d7e3e11406c49d21d468d7f28080c0f85ef85c8203e894e9f00c100f34decaf94297132ab80aee2e4c5b660801a0a3d98e7788294bee1f7acd39a8c903e9c336f5323fd74e92e02ddfdf49319ac9a0781448d69ae20ebf5a6b47666483ee5d5c1bd0b2ebafbeb72cac1aa2c4756c2280a0b2f6a1c80319b8ebe97d6ce17a061a2739922e81b0b67bb7fb2c9fe3ece4fdeaa0178feb89001bce41b22d570296aa537da95ac015c9a8406095750cc67f618b7e",
      ]);
      assert(false, "Transaction should be rejected");
    } catch (e: any) {
      assert(
        e.message.includes("a legacy transaction must be with a legacy account key"),
        "Transaction should be rejected"
      );
    }
  }

  /***************** PRIVATE FUNCTIONS *****************/

  private async testToMustBeEoaWithoutCode(isSetCode = true) {
    console.log("Checking to must be EOA without code", isSetCode ? "after setCode" : "after reset");

    // `to` is eoaWithCode
    const txs = await genValueTransferRelatedTx(
      this.eoaWithoutCode.address,
      this.eoaWithCode.address,
      "1",
      this.eoaWithoutCode,
      this.signer
    );

    if (isSetCode) {
      for (const tx of txs) {
        try {
          await provider.send("kaia_sendRawTransaction", [tx]);
          assert(false, "Transaction should be rejected");
        } catch (e: any) {
          assert(e.message.includes("recipient must be an EOA without code"), "Recipient must be an EOA without code");
        }
      }
    } else {
      for (const tx of txs) {
        try {
          const txHash = await provider.send("kaia_sendRawTransaction", [tx]);
          await this.waitTime(2000);
          const receipt = await provider.getTransactionReceipt(txHash);
          assert(receipt.status === 1, "Transaction should be successful");
        } catch (e: any) {
          console.log(e);
          assert(false, "Transaction should be successful");
        }
      }
    }
  }

  private async testFromMustBeEoaWithoutCode(isSetCode = true) {
    console.log("Checking from must be EOA without code", isSetCode ? "after setCode" : "after reset");
    const randomKeys = Array.from({ length: 3 }, () => Wallet.createRandom().privateKey);
    const wallets = isSetCode
      ? [this.eoaWithCode, this.eoaWithCode]
      : randomKeys.map((key) => new Wallet(this.eoaWithCode.address, key, provider));

    const txs = await genAccountUpdateRelatedTx(
      this.eoaWithCode.address,
      randomKeys,
      [this.eoaWithCode, ...wallets],
      this.signer
    );

    if (isSetCode) {
      for (const tx of txs) {
        try {
          await provider.send("kaia_sendRawTransaction", [tx]);
          assert(false, "Transaction should be rejected");
        } catch (e: any) {
          assert(e.message.includes("sender must be an EOA without code"), "Sender must be an EOA without code");
        }
      }
    } else {
      for (const tx of txs) {
        try {
          const txHash = await provider.send("kaia_sendRawTransaction", [tx]);
          await this.waitTime(2000);
          const receipt = await provider.getTransactionReceipt(txHash);
          assert(receipt.status === 1, "Transaction should be successful");
        } catch (e: any) {
          console.log(e);
          assert(false, "Transaction should be successful");
        }
      }
    }
  }

  private async testToMustBeEoaWithCodeOrSCA(isSetCode = true) {
    console.log("Checking to must be EOA with code or SCA", isSetCode ? "after setCode" : "after reset");

    const txs = await genSmartContractExecutionRelatedTx(
      this.eoaWithoutCode.address,
      this.eoaWithCode.address,
      this.eoaWithoutCode,
      "0xd09de08a",
      this.signer
    );

    if (!isSetCode) {
      for (const tx of txs) {
        try {
          await provider.send("kaia_sendRawTransaction", [tx]);
          assert(false, "Transaction should be rejected");
        } catch (e: any) {
          assert(
            e.message.includes("recipient must be an EOA with code or an SCA"),
            "Recipient must be an EOA with code or an SCA"
          );
        }
      }
    } else {
      for (const tx of txs) {
        try {
          const txHash = await provider.send("kaia_sendRawTransaction", [tx]);
          await this.waitTime(2000);
          const receipt = await provider.getTransactionReceipt(txHash);
          assert(receipt.status === 1, "Transaction should be successful");
        } catch (e: any) {
          console.log(e);
          assert(false, "Transaction should be successful");
        }
      }
    }
  }

  private async testIncrement() {
    console.log("Checking increment of eoaWithCode");

    const before = await this.getCountOfEoaWithCode();
    await this.increment();
    const after = await this.getCountOfEoaWithCode();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testCallIncrement() {
    console.log("Checking callIncrement of eoaWithCode");

    const before = await this.getCountOfEoaWithCode();
    await this.callIncrement();
    const after = await this.getCountOfEoaWithCode();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testCallIncrementFromEoaWithCode() {
    console.log("Checking callIncrementFromEoaWithCode of eoaWithCode");

    const before = await this.delegation.count();
    await this.callIncrementFromEoaWithCode();
    const after = await this.delegation.count();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testDelegatecallIncrement() {
    console.log("Checking delegatecallIncrement of eoaWithCode");

    const before = await this.delegation.count();
    await this.delegatecallIncrement();
    const after = await this.delegation.count();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testDelegatecallIncrementFromEoaWithCode() {
    console.log("Checking delegatecallIncrementFromEoaWithCode of eoaWithCode");

    const before = await this.getCountOfEoaWithCode();
    await this.delegatecallIncrementFromEoaWithCode();
    const after = await this.getCountOfEoaWithCode();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testCallcodeIncrement() {
    console.log("Checking callcodeIncrement of eoaWithCode");

    const before = await this.delegation.count();
    await this.callcodeIncrement();
    const after = await this.delegation.count();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testCallcodeIncrementFromEoaWithCode() {
    console.log("Checking callcodeIncrementFromEoaWithCode of eoaWithCode");

    const before = await this.getCountOfEoaWithCode();
    await this.callcodeIncrementFromEoaWithCode();
    const after = await this.getCountOfEoaWithCode();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async increment() {
    const tx = await this.eoaWithCodeInstance.increment();
    await tx.wait(1);
  }

  private async callIncrement() {
    const tx = await this.delegation.callIncrement(this.eoaWithCodeInstance.address);
    await tx.wait(1);
  }

  private async callIncrementFromEoaWithCode() {
    const tx = await this.eoaWithCodeInstance.callIncrement(this.delegation.address);
    await tx.wait(1);
  }

  private async delegatecallIncrement() {
    const tx = await this.delegation.delegatecallIncrement(this.eoaWithCodeInstance.address);
    await tx.wait(1);
  }

  private async delegatecallIncrementFromEoaWithCode() {
    const tx = await this.eoaWithCodeInstance.delegatecallIncrement(this.delegation.address);
    await tx.wait(1);
  }

  private async callcodeIncrement() {
    const tx = await this.delegation.callcodeIncrement(this.eoaWithCodeInstance.address);
    await tx.wait(1);
  }

  private async callcodeIncrementFromEoaWithCode() {
    const tx = await this.eoaWithCodeInstance.callcodeIncrement(this.delegation.address);
    await tx.wait(1);
  }

  private async getCountOfEoaWithCode() {
    return await this.delegation.getCount(this.eoaWithCodeInstance.address);
  }

  private async getCodeFieldsOfEoaWithCode() {
    return await this.delegation.getCodeFields(this.eoaWithCodeInstance.address);
  }

  private async getAccountInfo(address: string) {
    return await provider.send("kaia_getAccount", [address, "latest"]);
  }

  private async isContractAccount(address: string) {
    return await provider.send("kaia_isContractAccount", [address, "latest"]);
  }

  private async waitTime(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function main() {
  const env = getEnv();
  const pragueHF = await getHF("pragueCompatibleBlock");
  console.log("pragueHF", pragueHF);

  const signer = new Wallet(env["PRIVATE_KEY"], provider);
  const eoaWithCode = new Wallet(env["EOA_WITH_CODE"], provider);
  const eoaWithoutCode = new Wallet(env["EOA_WITHOUT_CODE"], provider);
  const test = new TestEIP7702(signer, eoaWithCode, eoaWithoutCode);

  await test.setup();

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("==================== SET CODE =========================");

  await test.testCode();
  await test.testExecution();

  console.log("\n==================== TESTING OTHER TX TYPES =========================");

  await test.testKaiaTypeTxs(true);

  console.log("\n==================== RESET CODE =========================");

  await test.reset();
  await test.testCode(true);

  console.log("\n==================== TESTING OTHER TX TYPES (after reset) =========================");

  await test.testKaiaTypeTxs(false);

  console.log("\n==================== TESTING SET CODE AFTER ACCOUNT UPDATE =========================");

  await test.testSetCodeAfterAccountUpdate();
}

main();
