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
