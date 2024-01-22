import cc from "./cc";
import fs from "fs";

function checkSameResult(file1: string, file2: string) {
    const data1 = fs.readFileSync(file1, "utf8");
    const data2 = fs.readFileSync(file2, "utf8");
    const json1 = JSON.parse(data1);
    const json2 = JSON.parse(data2);
    let same = true;
    json1.forEach((it: any, index: number) => {
        if (it.op !== json2[index].op) {
            console.log("Different op!");
            console.log("index: ", index);
            console.log("op1: ", it.op);
            console.log("op2: ", json2[index].op);
            same = false;
        }
        if (it.computation !== json2[index].computation) {
            console.log("Different computation!");
            console.log("index: ", index);
            console.log("op: ", it.op);
            console.log("computation1: ", it.computation);
            console.log("computation2: ", json2[index].computation);
            same = false;
        }
        if (it.computationCost !== json2[index].computationCost) {
            console.log("Different computationCost!");
            console.log("index: ", index);
            console.log("op: ", it.op);
            console.log("computationCost1: ", it.computationCost);
            console.log("computationCost2: ", json2[index].computationCost);
            same = false;
        }
    });
    if (same) {
        console.log("Same result!");
    } else {
        console.log("Different result!");
    }
}

function checkComputationCost(fileName: string) {
    const data = fs.readFileSync(fileName, "utf8");
    const json = JSON.parse(data);
    let totalCost = 0;
    let prevComputation = -1;
    const wrongCost: any[] = [];
    json.forEach((it: any) => {
        const op = it.op;
        const computation = it.computation;
        const computationCost = it.computationCost;
        const ccCost = cc[op];
        if (computationCost !== ccCost) {
            console.log("Wrong computation cost!");
            console.log("op: ", op);
            console.log("computation: ", computation);
            console.log("computationCost: ", computationCost);
            console.log("ccCost: ", ccCost);
            console.log("computationCost !== ccCost");
            wrongCost.push({ op, computation, computationCost, ccCost });
        }
        totalCost += computationCost;
        if (prevComputation === -1 || prevComputation === computation + computationCost) {
            prevComputation = computation;
        } else {
            console.log("Wrong computation!");
            console.log("op: ", op);
            console.log("computation: ", computation);
            console.log("computationCost: ", computationCost);
            console.log("ccCost: ", ccCost);
            console.log("prevComputation: ", prevComputation);
            console.log("prevComputation !== computation + computationCost");
            wrongCost.push({ op, computation, computationCost, ccCost });
            prevComputation = computation;
        }
    });
    console.log("totalCost: ", totalCost);
    if (wrongCost.length === 0) {
        console.log("All computation costs are correct!");
    } else {
        console.log("Wrong computation costs: ", wrongCost);
    }
}

function main() {
    const fileName = ["debugTraceBlock.json", "debugTraceTransaction.json", "debugTraceCall.json"];
    fileName.forEach((it) => {
        checkComputationCost(it);
    });
    checkSameResult(fileName[0], fileName[1]);
}

main();
