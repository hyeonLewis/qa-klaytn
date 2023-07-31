import { apiGet, writeFile } from "./helper";
import { table } from "table";
import Caver from "caver-js";

const rpc = "http://localhost:8551/";
const metrics = "http://localhost:61001/metrics";

const caver = new Caver(rpc);

const vrankRegex: RegExp = /\b\w*(vrank)\w*\b.*/g;
const numberRegex: RegExp = /-?\d*\.?\d+e[+-]?\d+/g;

function filterVrankData(data: string): string[] {
  const vrank = data.match(vrankRegex);

  const vrankTimeData = vrank?.filter((data: string) => numberRegex.test(data));

  if (!vrankTimeData) throw new Error("No vrank data");

  return vrankTimeData;
}

async function getVrankTimeData() {
  const metricData = await apiGet(metrics);

  const vrankTimeData = filterVrankData(metricData);

  return vrankTimeData;
}

async function main() {
  let startBlockNumber = 0;
  let i = 0;
  let vrankTimeDataResult: string[][] = [];

  while (i < 5) {
    const blockNumberPromise = caver.rpc.klay.getBlockNumber();
    const vrankTimeDataPromise = getVrankTimeData();

    const result = await Promise.all([blockNumberPromise, vrankTimeDataPromise]);

    // VRank metric for block N will be updated in preprepare phase of block N+1,
    const blockNumber = Number(result[0]) - 1;
    let vrankTimeData = result[1];

    vrankTimeData = ["klaytn_block_number: " + String(blockNumber), ...vrankTimeData];

    if (startBlockNumber === 0) {
      startBlockNumber = blockNumber;

      vrankTimeDataResult.push(vrankTimeData);

      console.log("Start block number:", startBlockNumber);
      console.log("Add new data:", vrankTimeData);

      i++;

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      // Not in same block number
      if (vrankTimeData[0] !== vrankTimeDataResult[i - 1][0]) {
        console.log("Add new data:", vrankTimeData);

        vrankTimeDataResult.push(vrankTimeData);

        i++;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const tableFormat = table(vrankTimeDataResult);
  writeFile(__dirname + "/vrankTimeData.txt", tableFormat);
}

main();
