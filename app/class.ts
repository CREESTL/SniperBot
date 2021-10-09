import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();


import fs from "fs";
import chokidar from "chokidar";
import { Signer, ContractFactory, Contract, BigNumber, providers, Wallet} from "ethers";

const { ethers } = require("hardhat");

import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TransactionResponse, TransactionReceipt, Log, Provider } from "@ethersproject/abstract-provider";
import type { TransactionReceiptWithEvents, ContractData, Config, yamlToken } from "./types";
import { getContractFactory, loadSingleTokens, loadConfig, writeSingleTokens } from "./utils";
import { tokenState, Token } from "./token";
import * as utils from "./utils";



// TODO Change all testnets for mainnets before deploy

// TODO Check if process.env type suits variables


let uniswapRouterAddress: string, pancakeswapRouterAddress: string;
let ethRouter: Contract, bscRouter: Contract;


// TODO change treir types??
let ethProvider: Provider, bscProvider: Provider;
let ethWallet: Wallet, bscWallet: Wallet;
let ethFactory: Contract, bscFactory: Contract;
let uniswapPair: Contract, pancakeswapPair: Contract;
let baseToken: Contract;
let ETH_SWAP_AMOUNT: BigNumber, BSC_SWAP_AMOUNT: BigNumber;
let GAS_LIMIT: BigNumber;
let PRICE_RATIO: number;
let YAML_FILE_WITH_TOKENS: string;
let singleTokens: string[];
let tokens: Token[];



async function init(){

	// Addresses of Router in different chains
	const routerAddresses: { [key: string]: string } = {
	  mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
	  kovan: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
	  rinkeby: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
	  bsc_mainnet: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
	  bsc_testnet: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
	}
	const uniswapRouterAddress = routerAddresses['mainnet'];
	const pancakeswapRouterAddress = routerAddresses['bsc_testnet'];

	// Providers for Ethereum and BSC mainnets
	ethProvider = new ethers.providers.JsonRpcProvider('https://main-light.eth.linkpool.io/');
	bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
	// Routers for different chains
	ethRouter = await ethers.getContractAt("IUniswapV2Router02", uniswapRouterAddress, ethProvider);
	bscRouter = await ethers.getContractAt("IPancakeRouter02", pancakeswapRouterAddress, bscProvider);
	// User's wallets for different chains
	ethWallet = new ethers.Wallet(process.env.ETH_PRIVATE_KEY || ethers.Wallet.createRandom().address, ethProvider);
	bscWallet = new ethers.Wallet(process.env.BSC_PRIVATE_KEY || ethers.Wallet.createRandom().address, bscProvider);
	// Factories for different chains
	ethFactory = await ethers.getContractAt("IUniswapV2Factory", await ethRouter.factory(), ethProvider);
	bscFactory = await ethers.getContractAt("IPancakeFactory", await bscRouter.factory(), bscProvider);
	// Pairs for different chains
	uniswapPair = await ethers.getContractAt("IUniswapV2Pair", ethWallet.address, ethProvider);
	pancakeswapPair = await ethers.getContractAt("IPancakePair", ethWallet.address, bscProvider);
	// A base token for both platforms implements the same interface - IWETH
	baseToken = await ethers.getContractAt("IWETH", await ethRouter.WETH());
	// The amount of tokens user is ready to spend
	ETH_SWAP_AMOUNT = ethers.utils.parseEther(process.env.ETH_SWAP_AMOUNT || '0');
	BSC_SWAP_AMOUNT = ethers.utils.parseEther(process.env.BNB_SWAP_AMOUNT || '0');
	// Limit of gas
	GAS_LIMIT = ethers.utils.parseEther(process.env.GAS_LIMIT || '0');
	// token/baseToken price ratio that has to bee reached to sell the token
	PRICE_RATIO = +(process.env.PRICE_RATIO || '1');
	// Path to local .yaml file with token addresses
	YAML_FILE_WITH_TOKENS = "tokens.yaml";

	// List of tokens without a pair
	singleTokens = [];
	// A list of Token class objects to work with
	tokens = [];

}




class BotHead {


	wallet: Wallet;
	provider: Provider;
	router: Contract;
	factory: Contract;
	pair: Contract;
	swapAmount: BigNumber;

	// Other variables are either the same for any class instance or can be recreated from the following variables
	constructor(wallet: Wallet, router: Contract, factory: Contract, pair: Contract, swapAmount: BigNumber){
		this.wallet = wallet;
		this.provider = this.wallet.provider;
		this.router = router;
		this.factory = factory;
		this.pair = pair;
		this.swapAmount = swapAmount;
	}

	async watch(){

	}

}


async function main(){
	await init();
	// console.log("SWAP_AMOUNT is ", ETH_SWAP_AMOUNT);
	// let firstHead = new BotHead(ethWallet, ethRouter, bscFactory, uniswapPair, ETH_SWAP_AMOUNT);
	console.log("Nice");
}



main()