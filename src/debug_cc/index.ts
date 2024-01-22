import { ethers } from "ethers";
import { Interface } from "ethers/lib/utils";
import axios from "axios";
import fs from "fs";
import { rpcUrl, testingAddress, abi, byteCode, zeroAddress } from "./constant";
import dotenv from "dotenv";
dotenv.config();

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

function encodeFunctionData() {
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData("testComputationCost", []);
    return data;
}

function encodeFunctionData2() {
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData("testComputationCost2", []);
    return data;
}

async function executeTx(tx: any) {
    const res = await wallet.sendTransaction(tx);
    await res.wait();
    return res;
}

async function deployContract() {
    const factory = new ethers.ContractFactory(abi, byteCode, wallet);
    const contract = await factory.deploy();
    console.log("Contract deployed at address: ", contract.address);
    return contract;
}

async function debugBlock(blockHash: string) {
    const res = await provider.send("debug_traceBlockByHash", [blockHash]);
    const writeData = JSON.stringify(
        res[0].result.structLogs.map((it: any) => {
            return { op: it.op, gas: it.gas, gasCost: it.gasCost, computation: it.computation, computationCost: it.computationCost };
        })
    );
    fs.writeFile("debugTraceBlock.json", writeData, (err) => {
        if (err) {
            console.log(err);
        }
    });
}

async function debugTransaction(txHash: string) {
    const res = await provider.send("debug_traceTransaction", [txHash]);

    const writeData = JSON.stringify(
        res.structLogs.map((it: any) => {
            return { op: it.op, gas: it.gas, gasCost: it.gasCost, computation: it.computation, computationCost: it.computationCost };
        })
    );
    fs.writeFile("debugTraceTransaction.json", writeData, (err) => {
        if (err) {
            console.log(err);
        }
    });
}

async function debugCall(tx: any) {
    const res = await provider.send("debug_traceCall", [tx, "latest"]);

    const writeData = JSON.stringify(
        res.structLogs.map((it: any) => {
            return { op: it.op, gas: it.gas, gasCost: it.gasCost, computation: it.computation, computationCost: it.computationCost };
        })
    );
    fs.writeFile("debugTraceCall.json", writeData, (err) => {
        if (err) {
            console.log(err);
        }
    });
}

async function getTxByHash(txHash: string) {
    const data = {
        method: "klay_getTransactionByHash",
        params: [txHash],
        id: 1,
        jsonrpc: "2.0",
    };
    const res = await axios.post(rpcUrl, data);
    return res.data;
}

async function main() {
    const contract = await deployContract();
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const data = encodeFunctionData();
    const data2 = encodeFunctionData2();

    const tx = {
        from: testingAddress,
        to: contract.address,
        data: data2,
    };
    const txForDebugCall = {
        from: zeroAddress,
        to: contract.address,
        data: data,
    };

    const sentTx = await executeTx(tx);
    const txHash = sentTx.hash;
    console.log("txHash: ", txHash);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const txReceipt = await getTxByHash(txHash);
    const blockHash = txReceipt.result.blockHash;

    await debugBlock(blockHash);
    await debugTransaction(txHash);
    await debugCall(txForDebugCall);
}

main();
