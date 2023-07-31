import { readFileSync, writeFileSync } from "fs";
import axios from "axios";

const promiseMap: { [key: string]: Promise<any> } = {};

export async function apiGet(url: string, queryParams?: object) {
  const key = JSON.stringify({ url, queryParams });
  promiseMap[key] = promiseMap[key] || axios.get(url, { params: queryParams });
  try {
    return (await promiseMap[key])?.data;
  } catch (err) {
    console.error(err);
    return null;
  } finally {
    delete promiseMap[key];
  }
}

export function openFile(fileName: string) {
  return readFileSync(__dirname + "/" + fileName, "utf-8");
}

export function writeFile(fileName: string, data: string) {
  writeFileSync(__dirname + "/" + fileName, data, { encoding: "utf-8" });
}
