import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();


import fs from "fs";
import chokidar from "chokidar";
import { Signer, ContractFactory, Contract, BigNumber, providers, Wallet} from "ethers";
import hardhat from "hardhat";
let { ethers } = hardhat;
let { formatEther, parseEther } = ethers.utils;
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TransactionResponse, TransactionReceipt, Log, Provider } from "@ethersproject/abstract-provider";
import type { TransactionReceiptWithEvents, ContractData, Config, yamlToken } from "./types";
import { getContractFactory, loadSingleTokens, loadConfig, writeSingleTokens } from "./utils";
import { tokenState, Token } from "./token";
import * as utils from "./utils";


// TODO Change all testnets for mainnets before deploy

// TODO Check if process.env type suits variables

// TODO create providers first of all

// TODO do I need 2 wallets or just one?


// User's wallets for different chains
const ethWallet = new ethers.Wallet(process.env.ETH_PRIVATE_KEY || '');
const bscWallet = new ethers.Wallet(process.env.BSC_PRIVATE_KEY || '');
// The amount of tokens user is ready to spend
const ETH_SWAP_AMOUNT: BigNumber = ethers.utils.parseEther(process.env.ETH_SWAP_AMOUNT || '0');
const BNB_SWAP_AMOUNT: BigNumber = ethers.utils.parseEther(process.env.BNB_SWAP_AMOUNT || '0');
// Limit of gas
const GAS_LIMIT: BigNumber = ethers.utils.parseEther(process.env.GAS_LIMIT || '0');
// token/baseToken price ratio that has to bee reached to sell the token
const PRICE_RATIO: number = +(process.env.PRICE_RATIO || '1');
console.log("Type of PRICE_RATIO is ", typeof PRICE_RATIO);

// Path to local .yaml file with token addresses
const YAML_FILE_WITH_TOKENS: string = "tokens.yaml";

// Addresses of Router in different chains
const routerAddresses: { [key: string]: string } = {
  mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  kovan: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  rinkeby: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  bsc_mainnet: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  bsc_testnet: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
}

const uniswapRouterAddress: string = routerAddresses['mainnet']
const pancakeswapRouterAddress: string = routerAddresses['bsc_testnet']

// Routers have different addresses so they have to be different variables
const uniswapRouter: Contract = await ethers.getContractAt("IUniswapV2Router02", uniswapRouterAddress);
const pancakeswapRouter: Contract = await ethers.getContractAt("IPancakeRouter02", pancakeswapRouterAddress);
	
// Factories are initialized using each router's method - so they also have different addresses and have to be different variables
const uniswapFactory: Contract = await ethers.getContractAt("IUniswapV2Factory", await uniswapRouter.factory());
const pancakeswapFactory: Contract = await ethers.getContractAt("IPancakeFactory", await pancakeswapRouter.factory());

// Pairs are using two differente wallets (signers) 
const uniswapPair: ContractFactory = await getContractFactory("IUniswapV2Pair", ethWallet);
const pancakeswapPair: ContractFactory = await getContractFactory("IPancakePair", bscWallet);

// A base token for both platforms implements the same interface - IWETH
const baseToken: Contract = await ethers.getContractAt("IWETH", await uniswapRouter.WETH());

// List of tokens without a pair
let singleTokens: string[];

// A list of Token class objects to work with
let tokens: Token[];




class BotHead {


}


async function main(){

}

main()