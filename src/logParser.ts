import { readFileSync, writeFileSync } from "fs";
import { openFile, writeFile } from "./helper";
import { table } from "table";

const vrankRegex: RegExp = /\b\w*(VRank)\w*\b.*/g;

function main() {
  const logString = openFile("log.txt");
  const vrankLog = String(logString.match(vrankRegex));

  const splitLog = vrankLog.split(",");

  const splitLog2D = splitLog.map((log) => log.split(":"));

  const tableFormat = table(splitLog2D);

  writeFile("vrankLog.txt", tableFormat);
}

main();
