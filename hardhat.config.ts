import { HardhatUserConfig } from "hardhat/config";
import "hardhat-deploy";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

export const env = dotenv.config().parsed;

const defaultKey = "0x00000000000000000000000000000000000000000000000000000000cafebabe";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.4.24",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
      {
        version: "0.8.19",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
      {
        version: "0.8.25",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
    ],
  },

  networks: {
    hardhat: {
      accounts: {
        accountsBalance: 1_000_000_000n.toString() + "0".repeat(18),
      },
    },
    baobab: {
      url: env?.["BAOBAB_URL"] || "https://archive-en-kairos.node.kaia.io/",
      chainId: 1001,
      // Sample private keys for testing
      accounts: [env?.["PRIVATE_KEY"] || defaultKey],
      live: true,
      saveDeployments: true,
    },
    cypress: {
      url: env?.["CYPRESS_URL"] || "https://archive-en.node.kaia.io",
      chainId: 8217,
      accounts: [env?.["PRIVATE_KEY"] || defaultKey, env?.["PRIVATE_KEY2"] || defaultKey],
      live: true,
      saveDeployments: true,
    },
    homi: {
      url: "http://127.0.0.1:8551",
      accounts: [env?.["PRIVATE_KEY"] || defaultKey || defaultKey],
      live: false,
      saveDeployments: false,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 30,
        passphrase: "",
      },
      live: false,
      saveDeployments: true,
    },
  },
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
    },
  },
  paths: {
    sources: "./src/",
    deployments: "deployments",
  },
};

export default config;
