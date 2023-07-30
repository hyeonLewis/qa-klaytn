import { readFileSync, writeFileSync } from "fs";
import { table } from "table";

const vrankRegex: RegExp = /\b\w*(VRank)\w*\b.*/g;

function openLogFile(fileName: string) {
  return readFileSync(__dirname + "/" + fileName, "utf-8");
}

function writeLogFile(fileName: string, data: string) {
  writeFileSync(__dirname + "/" + fileName, data, { encoding: "utf-8" });
}

function main() {
  const logString = openLogFile("log.txt");
  const vrankLog = String(logString.match(vrankRegex));

  const splitLog = vrankLog.split(",");

  let splitLog2D: string[][] = [];
  for (let i = 0; i < splitLog.length; i++) {
    splitLog2D.push(splitLog[i].split(":"));
  }

  const tableFormat = table(splitLog2D);

  writeLogFile("vrankLog.txt", tableFormat);
}

main();
