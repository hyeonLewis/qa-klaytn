import { ethers } from "ethers";
import { TxType, AccountKeyType } from "@kaiachain/js-ext-core";
import { Wallet, JsonRpcProvider } from "@kaiachain/ethers-ext";
import { computePublicKey } from "ethers/lib/utils";

export const url = "http://127.0.0.1:8551";
export const provider = new JsonRpcProvider(url);
export const chainId = 1000;
export const gasLimit = 1_000_000;
export const gasPrice = 30_000_000_000;

export async function genValueTransferRelatedTx(
  from: string,
  to: string,
  value: string,
  sender: Wallet,
  feePayer: Wallet
) {
  const types = [
    TxType.ValueTransfer,
    TxType.FeeDelegatedValueTransfer,
    TxType.FeeDelegatedValueTransferWithRatio,
    TxType.ValueTransferMemo,
    TxType.FeeDelegatedValueTransferMemo,
    TxType.FeeDelegatedValueTransferMemoWithRatio,
  ];

  const commonTx = {
    from: from,
    to: to,
    chainId: chainId,
    gasLimit: gasLimit,
    gasPrice: gasPrice,
    value: value,
  };

  let nonce = await provider.getTransactionCount(from);
  const txs = [];
  for (const txtype of types) {
    let data = "";
    let feeRatio = undefined;
    let isFeeDelegated = false;
    if (
      txtype === TxType.FeeDelegatedValueTransferWithRatio ||
      txtype === TxType.FeeDelegatedValueTransferMemoWithRatio
    ) {
      feeRatio = 30;
      isFeeDelegated = true;
    } else if (txtype === TxType.FeeDelegatedValueTransfer || txtype === TxType.FeeDelegatedValueTransferMemo) {
      isFeeDelegated = true;
    }
    if (
      txtype === TxType.ValueTransferMemo ||
      txtype === TxType.FeeDelegatedValueTransferMemo ||
      txtype === TxType.FeeDelegatedValueTransferMemoWithRatio
    ) {
      data = "0x123456";
    }

    const tx = {
      ...commonTx,
      type: txtype,
      nonce: nonce++,
      data: data,
      feeRatio: feeRatio,
    };

    if (isFeeDelegated) {
      const populatedTx = await sender.populateTransaction(tx);
      const senderTxHashRLP = await sender.signTransaction(populatedTx);

      txs.push(await feePayer.signTransactionAsFeePayer(senderTxHashRLP));
    } else {
      const populatedTx = await sender.populateTransaction(tx);
      txs.push(await sender.signTransaction(populatedTx));
    }
  }

  return txs;
}

export async function genAccountUpdateRelatedTx(
  from: string,
  randomKeys: string[],
  wallets: Wallet[],
  feePayer: Wallet
) {
  const types = [TxType.AccountUpdate, TxType.FeeDelegatedAccountUpdate, TxType.FeeDelegatedAccountUpdateWithRatio];
  let nonce = await provider.getTransactionCount(from);
  const txs = [];

  const commonTx = {
    from: from,
    to: from,
    chainId: chainId,
    gasLimit: gasLimit,
    gasPrice: gasPrice,
  };

  for (let i = 0; i < types.length; i++) {
    const txtype = types[i];
    let feeRatio = undefined;
    let isFeeDelegated = false;
    if (txtype === TxType.FeeDelegatedAccountUpdateWithRatio) {
      feeRatio = 30;
      isFeeDelegated = true;
    } else if (txtype === TxType.FeeDelegatedAccountUpdate) {
      isFeeDelegated = true;
    }

    const pub = ethers.utils.computePublicKey(randomKeys[i], true);

    const tx = {
      ...commonTx,
      type: txtype,
      nonce: nonce++,
      feeRatio: feeRatio,
      key: {
        type: AccountKeyType.Public,
        key: pub,
      },
    };

    if (isFeeDelegated) {
      const populatedTx = await wallets[i].populateTransaction(tx);
      const senderTxHashRLP = await wallets[i].signTransaction(populatedTx);
      txs.push(await feePayer.signTransactionAsFeePayer(senderTxHashRLP));
    } else {
      txs.push(await wallets[i].signTransaction(tx));
    }
  }

  return txs;
}

export async function genSmartContractExecutionRelatedTx(
  from: string,
  to: string,
  sender: Wallet,
  input: string,
  feePayer: Wallet
) {
  const types = [
    TxType.SmartContractExecution,
    TxType.FeeDelegatedSmartContractExecution,
    TxType.FeeDelegatedSmartContractExecutionWithRatio,
  ];
  let nonce = await provider.getTransactionCount(from);
  const txs = [];

  const commonTx = {
    from: from,
    to: to,
    value: 0,
    gasLimit: gasLimit,
    gasPrice: gasPrice,
    input: input,
  };

  for (const txtype of types) {
    let feeRatio = undefined;
    let isFeeDelegated = false;
    if (txtype === TxType.FeeDelegatedSmartContractExecutionWithRatio) {
      feeRatio = 30;
      isFeeDelegated = true;
    } else if (txtype === TxType.FeeDelegatedSmartContractExecution) {
      isFeeDelegated = true;
    }

    const tx = {
      ...commonTx,
      type: txtype,
      nonce: nonce++,
      feeRatio: feeRatio,
    };

    if (isFeeDelegated) {
      const populatedTx = await sender.populateTransaction(tx);
      const senderTxHashRLP = await sender.signTransaction(populatedTx);
      txs.push(await feePayer.signTransactionAsFeePayer(senderTxHashRLP));
    } else {
      txs.push(await sender.signTransaction(tx));
    }
  }

  return txs;
}
