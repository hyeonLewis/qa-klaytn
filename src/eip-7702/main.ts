import { ethers } from "ethers";
import { TxType, AccountKeyType } from "@kaiachain/js-ext-core";
import { Wallet, JsonRpcProvider } from "@kaiachain/ethers-ext";
import { Delegation__factory, Delegation } from "../../typechain-types";
import { getHF } from "../common/utils";
import { getEnv } from "../common/utils";
import { assert } from "console";
import { computePublicKey } from "ethers/lib/utils";
import {
  genAccountUpdateRelatedTx,
  genSmartContractExecutionRelatedTx,
  genSmartContractExecutionTx,
  genValueTransferRelatedTx,
  genValueTransferTx,
} from "./genTx";

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

    console.log("delegation deployed at", this.delegation.address);
    console.log("eoaWithCode", this.eoaWithCode.address);
    console.log("eoaWithoutCode", this.eoaWithoutCode.address);

    // This is the pre-calculated tx data for SetCodeTx.
    // It'll set the code ofr delegation contract to eoaWithCode.
    const tx = await provider.send("kaia_sendRawTransaction", [
      "0x7804f8ca8203e88014850ba43b74008307a12094aa3d17d2a89d79c8d7e3e11406c49d21d468d7f28080c0f85ef85c8203e894f772235464347a44a2f1e955b9b3fbd956bb63f70180a0c7203d9c986b18264c713a4cbf0d56f2db08b901776517224e22b9a478455723a06a428d5000823b84e4aeb32b6ae67b77dd2f41cc36dcdc4e77728faba7e6dbe101a0f987d87489039c640061bb54ee5a19211e0a44c5f7285b1b3702a4e8bcba69baa05716034f43c85b3151f192c6e9ce1c49ab6e33f9207506423b1d9e70a4f1df22",
    ]);

    await this.waitTime(2000);

    const receipt = await provider.send("kaia_getTransactionReceipt", [tx]);
    assert(receipt.type === "TxTypeEthereumSetCode", "SetCodeTx type mismatch");
    assert(receipt.typeInt === 30724, "SetCodeTx type mismatch");
    assert(
      receipt.authorizationList[0].chainId === "1000",
      "Authorization list chainId mismatch"
    );
    assert(
      receipt.authorizationList[0].address.toLowerCase() ===
        this.delegation.address.toLowerCase(),
      "Authorization list address mismatch"
    );
    assert(
      receipt.authorizationList[0].nonce === 1,
      "Authorization list nonce mismatch"
    );

    this.codeHash = ethers.utils.keccak256(
      "0xef0100" + this.delegation.address.slice(2).toLowerCase()
    );

    this.eoaWithCodeInstance = Delegation__factory.connect(
      this.eoaWithCode.address,
      this.signer
    );
  }

  async reset() {
    console.log("Resetting code of delegation contract to zero address");

    // Reset the code of delegation contract to zero address.
    await provider.send("kaia_sendRawTransaction", [
      "0x7804f8ca8203e80b14850ba43b74008307a12094aa3d17d2a89d79c8d7e3e11406c49d21d468d7f28080c0f85ef85c8203e89400000000000000000000000000000000000000000c01a08ff4b3e8a1de3f92a8d5a1fa24bbab19d428315b8df30765c16737f1ca0a1284a04dea959aa2be254af7ac29bdc10052da370e666ed0a4b6e192386d8b05f0821980a09ec5cece494c6edf34e2a7b98c743db2a17bbf08eec531d67a37030ffecfbd10a079b87dcfbb04c2277062b151a7a23a9eac41d3e5f6ecf259015a771959ffa6df",
    ]);

    await this.waitTime(2000);
  }

  /***************** TEST FUNCTIONS *****************/

  async testCode(isEmpty = false) {
    console.log(
      "Checking code",
      this.eoaWithCode.address,
      isEmpty ? "after reset" : "after set"
    );

    const codeFieldsFromVM = await this.getCodeFieldsOfEoaWithCode();
    const code = (
      await provider.getCode(this.eoaWithCode.address)
    ).toLowerCase();
    const accountInfo = await this.getAccountInfo(this.eoaWithCode.address);
    const isContract = await this.isContractAccount(this.eoaWithCode.address);

    // Account type should be 1 regardless of the code.
    assert(accountInfo.accType === 1, "accType mismatch");
    if (isEmpty) {
      assert(code === "0x", "Code mismatch");
      assert(accountInfo.account.vmVersion === 0, "vmVersion mismatch");
      assert(!isContract, "isContract mismatch");
      const emptyCodeHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes("")
      );
      const emptyCodeHashBase64 = Buffer.from(
        emptyCodeHash.slice(2),
        "hex"
      ).toString("base64");
      assert(
        accountInfo.account.codeHash === emptyCodeHashBase64,
        "codeHash mismatch"
      );

      assert(codeFieldsFromVM[0] === "0x", "Code mismatch");
      assert(codeFieldsFromVM[1] === emptyCodeHash, "Codehash mismatch");
      assert(codeFieldsFromVM[2].eq(0), "Size mismatch");
    } else {
      assert(
        code === "0xef0100" + this.delegation.address.slice(2).toLowerCase(),
        "Code mismatch rpc"
      );
      assert(accountInfo.account.vmVersion === 1, "vmVersion mismatch");
      assert(isContract, "isContract mismatch");
      assert(
        accountInfo.account.codeHash ===
          Buffer.from(this.codeHash.slice(2), "hex").toString("base64"),
        "codeHash mismatch rpc"
      );

      assert(codeFieldsFromVM[0].toLowerCase() === code, "Code mismatch vm");
      assert(
        codeFieldsFromVM[1].toLowerCase() === this.codeHash,
        "Codehash mismatch vm"
      );
      assert(codeFieldsFromVM[2].eq(23), "Size mismatch vm");
    }
  }

  async testExecution() {
    console.log("1. Checking execution of eoaWithCode");

    await this.testIncrement();
    await this.testCallIncrement();
    await this.testCallIncrementFromEoaWithCode();
    await this.testDelegatecallIncrement();
    await this.testDelegatecallIncrementFromEoaWithCode();
    await this.testCallcodeIncrement();
    await this.testCallcodeIncrementFromEoaWithCode();

    console.log("2. Checking execution of eoaWithCode from eoaWithCode");

    // from eoaWithCode to eoaWithCode
    await this.testIncrement(this.eoaWithCode);
    await this.testCallIncrement(this.eoaWithCode);
    await this.testCallIncrementFromEoaWithCode(this.eoaWithCode);
    await this.testDelegatecallIncrement(this.eoaWithCode);
    await this.testDelegatecallIncrementFromEoaWithCode(this.eoaWithCode);
    await this.testCallcodeIncrement(this.eoaWithCode);
    await this.testCallcodeIncrementFromEoaWithCode(this.eoaWithCode);

    console.log("3. Checking kaia tx types");
    await this.testKaiaTypeFromEoaWithCode();
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
        "0x7804f8ca8203e80d14850ba43b74008307a12094aa3d17d2a89d79c8d7e3e11406c49d21d468d7f28080c0f85ef85c8203e894f772235464347a44a2f1e955b9b3fbd956bb63f70e01a0693cb67ac7b5e6392613670f52ff77ca23cc58fa6457adbeb70fbd7f1a7ee8d7a006914d12d32e9ce9b5746db5589ce8166e9d9f8317a97d017229c5d43856d40901a02fa154b2f23d5ca2f3fe4a54f38b52142c95d0f2c69d452e97d9de1c292fee10a05023fc21adcb3060d57f5cd48c5ae4eb18428c921e50994d9e509714137cfabb",
      ]);
      assert(false, "Transaction should be rejected");
    } catch (e: any) {
      assert(
        e.message.includes(
          "a legacy transaction must be with a legacy account key"
        ),
        "Transaction should be rejected"
      );
    }
  }

  /***************** PRIVATE FUNCTIONS *****************/

  private async testKaiaTypeFromEoaWithCode() {
    const tx = await genValueTransferTx(
      this.eoaWithCode.address,
      this.eoaWithoutCode.address,
      "1",
      this.eoaWithCode
    );

    try {
      const beforeBalance = await provider.getBalance(
        this.eoaWithoutCode.address
      );
      const txHash = await provider.send("kaia_sendRawTransaction", [tx]);
      await this.waitTime(2000);
      const receipt = await provider.getTransactionReceipt(txHash);
      assert(receipt.status === 1, "Transaction should be successful");
      const afterBalance = await provider.getBalance(
        this.eoaWithoutCode.address
      );
      assert(afterBalance.sub(beforeBalance).eq(1), "Balance mismatch");
    } catch (e: any) {
      assert(false, "Transaction should be successful");
    }

    const tx2 = await genSmartContractExecutionTx(
      this.eoaWithCode.address,
      this.eoaWithCode.address,
      "0xd09de08a",
      this.eoaWithCode
    );

    try {
      const before = await this.getCountOfEoaWithCode();
      const txHash = await provider.send("kaia_sendRawTransaction", [tx2]);
      await this.waitTime(2000);
      const receipt = await provider.getTransactionReceipt(txHash);
      assert(receipt.status === 1, "Transaction should be successful");
      const after = await this.getCountOfEoaWithCode();
      assert(after.sub(before).eq(1), "Count mismatch");
    } catch (e: any) {
      assert(false, "Transaction should be successful");
    }
  }

  private async testToMustBeEoaWithoutCode(isSetCode = true) {
    console.log(
      "Checking to must be EOA without code",
      isSetCode ? "after setCode" : "after reset"
    );

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
          assert(
            e.message.includes("recipient must be an EOA without code"),
            "Recipient must be an EOA without code"
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

  private async testFromMustBeEoaWithoutCode(isSetCode = true) {
    console.log(
      "Checking from must be EOA without code",
      isSetCode ? "after setCode" : "after reset"
    );
    const randomKeys = Array.from(
      { length: 3 },
      () => Wallet.createRandom().privateKey
    );
    const wallets = isSetCode
      ? [this.eoaWithCode, this.eoaWithCode]
      : randomKeys.map(
          (key) => new Wallet(this.eoaWithCode.address, key, provider)
        );

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
          assert(
            e.message.includes("sender must be an EOA without code"),
            "Sender must be an EOA without code"
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

  private async testToMustBeEoaWithCodeOrSCA(isSetCode = true) {
    console.log(
      "Checking to must be EOA with code or SCA",
      isSetCode ? "after setCode" : "after reset"
    );

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

  private async testIncrement(from?: Wallet) {
    console.log("Checking increment of eoaWithCode");

    const before = await this.getCountOfEoaWithCode();
    await this.increment(from);
    const after = await this.getCountOfEoaWithCode();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testCallIncrement(from?: Wallet) {
    console.log("Checking callIncrement of eoaWithCode");

    const before = await this.getCountOfEoaWithCode();
    await this.callIncrement(from);
    const after = await this.getCountOfEoaWithCode();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testCallIncrementFromEoaWithCode(from?: Wallet) {
    console.log("Checking callIncrementFromEoaWithCode of eoaWithCode");

    const before = await this.delegation.count();
    await this.callIncrementFromEoaWithCode(from);
    const after = await this.delegation.count();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testDelegatecallIncrement(from?: Wallet) {
    console.log("Checking delegatecallIncrement of eoaWithCode");

    const before = await this.delegation.count();
    await this.delegatecallIncrement(from);
    const after = await this.delegation.count();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testDelegatecallIncrementFromEoaWithCode(from?: Wallet) {
    console.log("Checking delegatecallIncrementFromEoaWithCode of eoaWithCode");

    const before = await this.getCountOfEoaWithCode();
    await this.delegatecallIncrementFromEoaWithCode(from);
    const after = await this.getCountOfEoaWithCode();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testCallcodeIncrement(from?: Wallet) {
    console.log("Checking callcodeIncrement of eoaWithCode");

    const before = await this.delegation.count();
    await this.callcodeIncrement(from);
    const after = await this.delegation.count();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async testCallcodeIncrementFromEoaWithCode(from?: Wallet) {
    console.log("Checking callcodeIncrementFromEoaWithCode of eoaWithCode");

    const before = await this.getCountOfEoaWithCode();
    await this.callcodeIncrementFromEoaWithCode(from);
    const after = await this.getCountOfEoaWithCode();
    assert(after.sub(before).eq(1), "Count mismatch");
  }

  private async increment(from?: Wallet) {
    if (from) {
      const tx = await this.eoaWithCodeInstance.connect(from).increment();
      console.log(await tx.wait(1));
    } else {
      const tx = await this.eoaWithCodeInstance.increment();
      await tx.wait(1);
    }
  }

  private async callIncrement(from?: Wallet) {
    if (from) {
      const tx = await this.delegation
        .connect(from)
        .callIncrement(this.eoaWithCodeInstance.address);
      await tx.wait(1);
    } else {
      const tx = await this.delegation.callIncrement(
        this.eoaWithCodeInstance.address
      );
      await tx.wait(1);
    }
  }

  private async callIncrementFromEoaWithCode(from?: Wallet) {
    if (from) {
      const tx = await this.eoaWithCodeInstance
        .connect(from)
        .callIncrement(this.delegation.address);
      await tx.wait(1);
    } else {
      const tx = await this.eoaWithCodeInstance.callIncrement(
        this.delegation.address
      );
      await tx.wait(1);
    }
  }

  private async delegatecallIncrement(from?: Wallet) {
    if (from) {
      const tx = await this.delegation
        .connect(from)
        .delegatecallIncrement(this.eoaWithCodeInstance.address);
      await tx.wait(1);
    } else {
      const tx = await this.delegation.delegatecallIncrement(
        this.eoaWithCodeInstance.address
      );
      await tx.wait(1);
    }
  }

  private async delegatecallIncrementFromEoaWithCode(from?: Wallet) {
    if (from) {
      const tx = await this.eoaWithCodeInstance
        .connect(from)
        .delegatecallIncrement(this.delegation.address);
      await tx.wait(1);
    } else {
      const tx = await this.eoaWithCodeInstance.delegatecallIncrement(
        this.delegation.address
      );
      await tx.wait(1);
    }
  }
  private async callcodeIncrement(from?: Wallet) {
    if (from) {
      const tx = await this.delegation
        .connect(from)
        .callcodeIncrement(this.eoaWithCodeInstance.address);
      await tx.wait(1);
    } else {
      const tx = await this.delegation.callcodeIncrement(
        this.eoaWithCodeInstance.address
      );
      await tx.wait(1);
    }
  }
  private async callcodeIncrementFromEoaWithCode(from?: Wallet) {
    if (from) {
      const tx = await this.eoaWithCodeInstance
        .connect(from)
        .callcodeIncrement(this.delegation.address);
      await tx.wait(1);
    } else {
      const tx = await this.eoaWithCodeInstance.callcodeIncrement(
        this.delegation.address
      );
      await tx.wait(1);
    }
  }

  private async getCountOfEoaWithCode() {
    return await this.delegation.getCount(this.eoaWithCodeInstance.address);
  }

  private async getCodeFieldsOfEoaWithCode() {
    return await this.delegation.getCodeFields(
      this.eoaWithCodeInstance.address
    );
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

  console.log(
    "\n==================== TESTING OTHER TX TYPES ========================="
  );

  await test.testKaiaTypeTxs(true);

  console.log("\n==================== RESET CODE =========================");

  await test.reset();
  await test.testCode(true);

  console.log(
    "\n==================== TESTING OTHER TX TYPES (after reset) ========================="
  );

  await test.testKaiaTypeTxs(false);

  console.log(
    "\n==================== TESTING SET CODE AFTER ACCOUNT UPDATE ========================="
  );

  await test.testSetCodeAfterAccountUpdate();
}

main();
