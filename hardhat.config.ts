import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { HardhatUserConfig } from "hardhat/types";
import { ethers } from "ethers";

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";

// Add some .env individual variables
const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ALCHEMYAPI_URL = process.env.ALCHEMYAPI_URL;

const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY;
const BSC_MAINNET_PRIVATE_KEY = process.env.BSC_MAINNET_PRIVATE_KEY;
const BSC_TESTNET_PRIVATE_KEY = process.env.BSC_TESTNET_PRIVATE_KEY;
const KOVAN_PRIVATE_KEY = process.env.KOVAN_PRIVATE_KEY;
const RINKEBY_PRIVATE_KEY = process.env.RINKEBY_PRIVATE_KEY;

const FORK_URL = `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {runs: 1, enabled: true},
        },
      },
    ],
  },
  networks: {
    // Two chains for testing
    // 1)
    // a.k.a localhost
    hardhat: {
      forking: {
        url: FORK_URL
      },
      // Create 20 Signers with 1000 wei(not ETH!!!) each
      accounts: {
        count: 20,
        accountsBalance: ethers.utils.parseEther('1000').toString(),
      },
      // Each new block in mined once in 10 seconds
      mining: {
        auto: false,
        interval: 10000
      }
    },
    //2)
    // Forking is unavailable for any network but hardhat (default one)
    testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: []
    },

    // Mainnets
    // 1)
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: MAINNET_PRIVATE_KEY ? [MAINNET_PRIVATE_KEY] : [],
      chainId: 1,
    },
    //2)
    bsc_mainnet: {
      url: "https://bsc-dataseed.binance.org/",
      accounts: BSC_MAINNET_PRIVATE_KEY ? [BSC_MAINNET_PRIVATE_KEY] : [],
      chainId: 56,
    },
    
  },
  mocha: {
    timeout: 20000000,
  },
  paths: {
    sources: "./contracts/",
    tests: "./test/",
  },
};

export default config;
