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


class BotHead {
	// The name of the current platform to work with: Uniswap or Pancakeswap
	platform: string;
	// The amount of tokens user is ready to spend
	SWAP_AMOUNT: BigNumber;
	// Path to local .yaml file with token addresses
	YAML_FILE_WITH_TOKENS: string;
	// TODO For BSC too?
	// Limit of gas
	GAS_LIMIT: BigNumber;
	// Address of router
	ROUTER_ADDRESS: string;
	// token/baseToken price ratio that has to bee reached to sell the token
	// MUST be an integer!
	PRICE_RATIO: number;
	// List of tokens without a pair
	singleTokens: string[];
	// A router for the platform
	router: Contract;
	// A contract factory for the platform
	factory: Contract;
	// A pair (WETH/ERC-20 or WBNB/BEP-20)
	pair: ContractFactory;
	// A base token for the platform (WETH or WBNB)
	baseToken: Contract;
	// Address of the wallet of the user
	wallet: SignerWithAddress;
	// A list of Token class objects to work with
	tokens: Token[];

	// Constructor only requires one argument - the nae of the platform (swap)
	constructor(platform: string){
		if (!((platform == "Uniswap") || (platform == "PancakeSwap"))){
			throw Error("Incorrect platform name! Please enter 'Uniswap' or 'PancakeSwap'.");
		}
		this.platform = platform;
	}

	// Function initializes veriables of the class
	async initConsts() {
		// Some consts are similar for both platforms

		// Path to the file with the list of desired tokens(tokens that user wants to buy)
		this.YAML_FILE_WITH_TOKENS = "tokens.yaml";
		// At first the list must be empty
	  this.singleTokens = [];
	  // TODO initialize wallet (signer) here
	  // this.wallet = ...
	  this.tokens = [];
		
		// Some consts are unique for each platform
		if (this.platform == "Uniswap"){
			this.SWAP_AMOUNT = parseEther(process.env.ETH_SWAP_AMOUNT || "");
			this.GAS_LIMIT = BigNumber.from('300000');
			this.ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
			this.PRICE_RATIO = 1;
		  this.router = await ethers.getContractAt("IUniswapV2Router02", this.ROUTER_ADDRESS);
		  // Both WBNB and WETH implement the same IWETH interface
	  	this.baseToken = await ethers.getContractAt("IWETH", await this.router.WETH());
		  this.factory = await ethers.getContractAt("IUniswapV2Factory", await this.router.factory());
		  this.pair = await getContractFactory("IUniswapV2Pair", this.wallet);
		}

		if (this.platform == "PancakeSwap"){
			this.SWAP_AMOUNT = parseEther(process.env.BNB_SWAP_AMOUNT || "");
			// TODO Do I need gas here?
			this.GAS_LIMIT = BigNumber.from('300000');
			this.ROUTER_ADDRESS = "0x10ed43c718714eb63d5aa57b78b54704e256024e";
			this.PRICE_RATIO = 1;
		  this.router = await ethers.getContractAt("IPancakeRouter02", this.ROUTER_ADDRESS);
		  // Both WBNB and WETH implement the same IWETH interface
	  	this.baseToken = await ethers.getContractAt("IWETH", await this.router.WETH());
		  this.factory = await ethers.getContractAt("IPancakeFactory", await this.router.factory());
		  this.pair = await getContractFactory("IUniswapV2Pair", this.wallet);
		}


	}

}


async function main(){
	let bot = new BotHead('PancakeSwap');
	await bot.initConsts();
	console.log("nice");
}

main()