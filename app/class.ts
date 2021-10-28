import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();


import fs from "fs";
import chokidar from "chokidar";
import { Signer, ContractFactory, Contract, BigNumber, providers, Wallet } from "ethers";

const { ethers } = require("hardhat");

import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TransactionResponse, TransactionReceipt, Log, Provider } from "@ethersproject/abstract-provider";
import type { TransactionReceiptWithEvents, ContractData, Config, yamlToken } from "./types";
import { getContractFactory, loadSingleTokens, loadConfig, writeSingleTokens } from "./utils";
import { tokenState, Token } from "./token";
import * as utils from "./utils";



// TODO Change all testnets for mainnets before deploy

// TODO Check if process.env type suits variables

// TODO previously argument 'wallet' in functions was of type "SignerWithAddress" not "Wallet"! Change if not working!
// TODO change to wallet.address after changing wallets type or bring SingerWithAddress back 

// TODO Invalid ENS name  == invalid address somewhere

let uniswapRouterAddress: string, pancakeswapRouterAddress: string;
let ethRouter: Contract, bscRouter: Contract;


// TODO change types??
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
let WETH: string;




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


	//ethProvider = await ethers.getDefaultProvider();
	ethProvider = new ethers.providers.JsonRpcProvider('https://main-light.eth.linkpool.io/', { name: "homestead", chainId: 1 });
	bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/', { name: 'binance', chainId: 56 });

	// User's wallets for different chains
	// The last argument is this case is a provider. In all other contracts below - wallet
	ethWallet = new ethers.Wallet(process.env.ETH_PRIVATE_KEY || ethers.Wallet.createRandom().address, ethProvider);
	bscWallet = new ethers.Wallet(process.env.BSC_PRIVATE_KEY || ethers.Wallet.createRandom().address, bscProvider);

	// Routers for different chains
	ethRouter = await ethers.getContractAt("IUniswapV2Router02", uniswapRouterAddress, ethWallet);
	bscRouter = await ethers.getContractAt("IPancakeRouter02", pancakeswapRouterAddress, bscWallet);

	// Factories for different chains
	// In case of ETH (we have the default provider) .factory() method is available
	ethFactory = await ethers.getContractAt("IUniswapV2Factory", await ethRouter.factory(), ethWallet);
	// In case of BSC we have to explicitly pass the address of the factory
	bscFactory = await ethers.getContractAt("IPancakeFactory", '0xBCfCcbde45cE874adCB698cC183deBcF17952812', bscWallet);

	// Pairs for different chains
	uniswapPair = await ethers.getContractAt("IUniswapV2Pair", ethWallet.address, ethWallet);
	pancakeswapPair = await ethers.getContractAt("IPancakePair", ethWallet.address, bscWallet);
	// A base token for both platforms implements the same interface - IWETH
	baseToken = await ethers.getContractAt("IWETH", await ethRouter.WETH());
	// WETH address for both chains
	WETH = await ethRouter.WETH()
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


	console.log("Global constants have been initialized");

}




class BotHead {

	wallet: Wallet;
	provider: Provider;
	router: Contract;
	factory: Contract;
	pair: Contract;
	swapAmount: BigNumber;
	headNum: number;

	// Other variables are either the same for any class instance or can be recreated from the following variables
	constructor(wallet: Wallet, router: Contract, factory: Contract, pair: Contract, swapAmount: BigNumber, num: number){
		this.wallet = wallet;
		this.provider = this.wallet.provider;
		this.router = router;
		this.factory = factory;
		this.pair = pair;
		this.swapAmount = swapAmount;
		this.headNum = num;
	}



	// Lots of helper-functions...
	// Function return the number of block the transaction was mined at
	getTransactionBlock = async (txHash: string) => {
	  // Receipt is only available for mined transactions
	  let txReceipt = await this.provider.getTransactionReceipt(txHash);
	  let blockNumber = txReceipt.blockNumber;
	  return blockNumber;
	}


	// Function to change token's pair address
	changePairAddress = (token: Token, pairAddress: string) => {
	  let exactToken = tokens.find(t => t.address == token.address);
	  if (exactToken !== undefined){
	    tokens[tokens.indexOf(exactToken)].pairAddress = pairAddress;
	  }
	}


	// Function to change token's state in global array
	changeState = (token: Token, newState: tokenState) => {
	  let exactToken = tokens.find(t => t.address == token.address);
	  if (exactToken !== undefined){
	    console.log(`(changeState) Changing token's ${token.address} state to ${newState}`);
	    tokens[tokens.indexOf(exactToken)].state = newState;     
	  }
	}


	// Function to set token's old price while the token in already in the list
	changeOldPrice = (token: Token, oldPrice: BigNumber) => {
	  let exactToken = tokens.find(t => t.address == token.address);
	  if (exactToken !== undefined){
	    tokens[tokens.indexOf(exactToken)].oldPrice = oldPrice;
	  }
	}

	// Function to set token's current price while the token in already in the list
	changeCurrentPrice = (token: Token, currentPrice: BigNumber) => {
	  let exactToken = tokens.find(t => t.address == token.address);
	  if (exactToken !== undefined){
	    tokens[tokens.indexOf(exactToken)].currentPrice = currentPrice;
	  }
	}


	// Function checks if token has already got old price
	checkOldPriceExists = (token: Token) => {
	  let exactToken = tokens.find(t => t.address == token.address);
	  if ((exactToken !== undefined) && (exactToken.oldPrice !== undefined)){
	    return true;
	  }
	  return false;
	}

	// Function to check if the token is being bought
	// Returns true if the token is NOT free
	checkBuying = (token: Token) => {
	  let exactToken = tokens.find(t => t.address.toLowerCase() == token.address.toLowerCase());
	  if (exactToken !== undefined){
	    if (exactToken.state == tokenState.Buying){
	      return true;
	    }
	  }
	  return false;
	}

	// Function to check if the token is being bought or has already been bought
	// Returns true if the token is NOT free
	checkBought = (token: Token) => {
	  let exactToken = tokens.find(t => t.address.toLowerCase() == token.address.toLowerCase());
	  if (exactToken !== undefined){
	    if (exactToken.state == tokenState.Bought){
	      return true;
	    }
	  }
	  return false;
	}


	// Function to check if the token is being sold
	checkSelling = (token: Token) => {
	  let exactToken = tokens.find(t => t.address == token.address);
	  if (exactToken !== undefined){
	    if (exactToken.state == tokenState.Selling){
	      return true;
	    }
	  }
	  return false;
	}


	// Function to check if the token has already been sold
	checkSold = (token: Token) => {
	  let exactToken = tokens.find(t => t.address == token.address);
	  if (exactToken !== undefined){
	    if (exactToken.state == tokenState.Sold){
	      return true;
	    }
	  }
	  return false;
	}



	// Function checks if it's time to sell tokens with 10x higher price
	checkTokenPriceAndSellToken = async (token: Token) => {

	  console.log("(checkTokenPriceAndSellToken) Checking token's price...");
	  // We have to work with the token from tokens - not just a new one
	  let exactToken = tokens.find(t => t.address == token.address);
	  // If the token wasn't found in tokens - there is nothing to do here
	  if (exactToken === undefined){
	    return;
	  }
	  
	  let bothPrices = await this.router.getAmountsOut(ethers.utils.parseEther('1'), [WETH, exactToken.address]);
	  let currentPrice = bothPrices[1];

	  // Change token's current price
	  this.changeCurrentPrice(exactToken, currentPrice);

	  console.log(`(checkTokenPriceAndSellToken) Token (${exactToken.address}) current price is: `, ethers.utils.formatEther(exactToken.currentPrice));
	  console.log(`(checkTokenPriceAndSellToken) Token (${exactToken.address}) old price is: `, ethers.utils.formatEther(exactToken.oldPrice));
	  // If new price is strictly PRICE_RATIO time more than the old one - we sell the token
	  if (exactToken.currentPrice.gt(exactToken.oldPrice.mul(PRICE_RATIO))){ 
	    console.log(`(checkTokenPriceAndSellToken) Token (${exactToken.address}) price is ${PRICE_RATIO}x - try to sell it!`);
	    // Convert token from Token class into Contract
	    let tokenContract = await ethers.getContractAt("IERC20", exactToken.address);

	    await this.sellToken(this.wallet, tokenContract, await this.provider.getGasPrice());
	  }
	}

	// Function adds two events listeners for the pair
	addPairListeners = async (token: Token, pairAddress: string) => {
	  console.log("(addPairListeners) Adding listeners for pair with address: ", pairAddress);
	  let pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
	  // Usually Mint and Swap events are emitted via addLiquidityETH or addLiquidity
	  // And they happen almost AT THE SAME TIME
	  pair.on("Mint", (sender: string, amount0: BigNumber, amount1: BigNumber) => {
	    // If token still hasn't been bought when Mint occured - we don't have to buy it
	    if (this.checkBuying(token)){
	      return;
	    }
	    console.log("(addPairListeners) LP tokens have been minted in the pair with address: ", pair.address);
	    // And only if tokens have been bought - we can sell them
	    if (this.checkBought(token)){
	      console.log("(addPairListeners) A token from that pair has been bought - we can sell it now");
	      this.checkTokenPriceAndSellToken(token);
	    }
	  })
	  pair.on("Swap", (sender: string, amount0In: BigNumber, amount1In: BigNumber, amount0Out: BigNumber, amount1Out: BigNumber, to: string) => {
	    if (this.checkBuying(token)){
	      return;
	    }
	    console.log("(addPairListeners) Swap occured in the pair with address: ", pair.address);
	    if (this.checkBought(token)){
	      console.log("(addPairListeners) A token from that pair has been bought - we can sell it now");
	      this.checkTokenPriceAndSellToken(token);
	    }
	  })
	}


	// Function to parse "data" field of addLiquidityETH transaction
	parseAddLiquidityETHDataField = async (data: string) => {
	  let abiRouter = require('../artifacts/contracts/interfaces/IUniswapV2Router02.sol/IUniswapV2Router02.json').abi;
	  let uniswapRouter = new ethers.utils.Interface(abiRouter);
	  let parsed_data = uniswapRouter.decodeFunctionData("addLiquidityETH", data);

	  return parsed_data;
	}


	// Function to parse "data" field of addLiquidity transaction
	parseAddLiquidityDataField = async (data: string) => {
	  let abiRouter = require('../artifacts/contracts/interfaces/IUniswapV2Router02.sol/IUniswapV2Router02.json').abi;
	  let uniswapRouter = new ethers.utils.Interface(abiRouter);
	  let parsed_data = uniswapRouter.decodeFunctionData("addLiquidity", data);

	  return parsed_data;
	}
	  

	// Function to check if token from parsed data in in the list of tokens to buy
	checkParsedData = (parsedData: any) => {
	  let token = parsedData.token.toLowerCase();
	  if (singleTokens.includes(token)){
	    return true;
	  }
	  return false;
	}


	// Function removes all events listeners from pairs
	removePairListeners = async () => {
	  for (let token of tokens){
	    let pair = await ethers.getContractAt("IUniswapV2Pair", token.pairAddress);
	    pair.removeAllListeners("Mint");
	    pair.removeAllListeners("Swap");
	  }
	}


	// Function removes Mint event listeners from tokens
	removeTokenListeners = (singleTokens: string[]) => {
	  // Remove all listeners for Mint event of tokens we are no loger interested in
	  singleTokens.forEach((token: string): void => {
	    ethers.provider.removeAllListeners({
	      address: token,
	      topics: [
	        this.pair.interface.getEventTopic("Mint"),
	      ],
	    });
	  });
	}



	// Function to buy a single token from the minted pair
	buyToken = async (wallet: Wallet, singleToken: Contract, gasPrice: BigNumber): Promise<void> => {

	  console.log("(buyToken) Trying to buy a token with address: ", singleToken.address.toLowerCase());

	  // Create a new instance of Token class with token's address
	  let token = new Token(singleToken.address);

	  // Check if the token has been processed
	  // If it has - exit
	  if (this.checkBuying(token) || this.checkBought(token) || this.checkSelling(token) || this.checkSold(token)){
	    console.log("(buyToken) This token has been processed - cancel buying!");
	    return;
	  } else {
	    console.log("(buyToken) This token is free - we can buy it!");
	    // Change token's state to Buying
	    token.state = tokenState.Buying;
	    // And add it to the list of tokens as fast as possible
	    tokens.push(token);
	  }

	  let path: string[] = [WETH, singleToken.address];

	  // Swap ETH for tokens
	  let swapTx: TransactionResponse = await this.router.swapExactETHForTokens(
	    0, 
	    path,
	    wallet.address, 
	    Date.now() + 1000 * 60 * 10,
	    // Here we must specify the amount of ETH we are ready to spend and the gas price must be exactly 1 wei lower than
	    // the gas price of adding liquidity transaction
	    {value: ETH_SWAP_AMOUNT, gasPrice: gasPrice},
	  );

	  // Wait for the transaction to finish
	  // It is important because only then there will be liquidity in the pair
	  await swapTx.wait();

	  console.log("(buyToken) Token buying transaction was mined at block: ", await this.getTransactionBlock(swapTx.hash));

	  console.log(
	    `(buyToken) Token bought!\n`,
	    `(buyToken) Token name: ${await singleToken.name()}\n`,
	    `(buyToken) Token balance of the wallet: ${ethers.utils.formatEther(await singleToken.balanceOf(wallet.address))}\n`,
	    `(buyToken) ETH balance of the wallet: ${ethers.utils.formatEther(await wallet.getBalance())}` 
	    );

	  // We only have to set token's old price once
	  if (!this.checkOldPriceExists(token)){
	    // Get token/ETH price before buying the token
	    // Price is BigNumber
	    let bothPrices = await this.router.getAmountsOut(ethers.utils.parseEther('1'), [WETH, token.address]);
	    let oldPrice = bothPrices[1];
	    console.log("(buyToken) Old price of token is ", ethers.utils.formatEther(oldPrice), 'ETH');
	    // Change token's old price while it's already in the list 
	    this.changeOldPrice(token, oldPrice);
	  }

	  // Changes token's state to Bought only in that function
	  this.changeState(token, tokenState.Bought);
	 
	}



	// Function to sell a single token from the minted pair
	sellToken = async (wallet: Wallet, singleToken: Contract, gasPrice: BigNumber): Promise<void> => {
	  console.log("(sellToken) Trying to sell a token with address: ", singleToken.address); 

	  // Create a new instance of Token class with token's address
	  let token = new Token(singleToken.address);

	  // Check if the token has been processed before
	  // If it has - exit
	  if (this.checkSelling(token) || this.checkSold(token) || this.checkBuying(token)){
	    console.log(`(sellToken)This token has been processed -  cancel selling!`);
	    // If it has - no need to go further
	    return;
	  }

	  // Change token's state to Selling in the list
	  this.changeState(token, tokenState.Selling);

	  let path: string[] = [singleToken.address, WETH];

	  // Approve transaction of twice as much tokens as there are in the wallet (just in case)
	  console.log("(sellToken) Approving selling tokens...");
	  let approveTx = await singleToken.approve(this.router.address, (await singleToken.balanceOf(wallet.address)).mul(2));
	  await approveTx.wait();
	  console.log("(sellToken) Approved!");

	  // Swap ETH for tokens
	  let swapTx: TransactionResponse = await this.router.swapExactTokensForETH(
	    await singleToken.balanceOf(wallet.address), 
	    // At least 1 wei should return 
	    1,
	    path, 
	    wallet.address, 
	    Date.now() + 1000 * 60 * 10,
	    // We don't need to specify any other parameters here
	  );

	  // Wait for the transaction to finish
	  await swapTx.wait();
	  // Changes token's state to Sold only in that function
	  this.changeState(token, tokenState.Sold);

	  
	  console.log(
	  `(sellToken) Token sold!\n`,
	  `(sellToken) Token name: ${await singleToken.name()}\n`,
	  `(sellToken) Token balance of the wallet: ${ethers.utils.formatEther(await singleToken.balanceOf(wallet.address))}\n`,
	  `(sellToken) ETH balance of the wallet: ${ethers.utils.formatEther(await wallet.getBalance())}`
	  );
	}


	// Buying token is available only after the whole pair it is in is minted
	// This function awaits that event
	waitMintAndBuyToken = (pair: Contract, wallet: Wallet, singleToken: Contract, gasPrice: BigNumber): void => {

	    // Create a new instance of Token class with token's address and state
	    // We should "lock" that token's state at "Buying" while we wait for the pair to be minted
	    let token = new Token(singleToken.address, tokenState.Buying);
	    // Add token to the tokens only if there is no any other token with such address that is being bought or has been bought
	    if (!(this.checkBuying(token) || this.checkBought(token))){
	     tokens.push(token); 
	    }

	    pair.once("Mint", async () => {
	      console.log("(waitMintAndBuyToken) Pair has been minted!");
	      // After the pair is minted we can but the token
	      await this.buyToken(this.wallet, singleToken, gasPrice);
	    });
	}


	// Main farming function
	// Function updates the list of desired tokens and logs it into the file
	// Runs on EACH update of tokens.yaml file
	buyAndUpdateSingleTokens = async (pair: Contract, wallet: Wallet, singleToken: Contract, gasPrice: BigNumber): Promise<void> => {
	  // Get tokens addresses from the local tokens.yaml file

	  // TODO add pancakeswap here
	  let yamlTokensFromFile = loadSingleTokens(YAML_FILE_WITH_TOKENS);
	  // TODO Do I need to separate those in 2 parts or I can just work with all of them together?
	  let uniswapTokens = yamlTokensFromFile["Uniswap"] ? yamlTokensFromFile["Uniswap"] : [];
	  // let pancakeswapTokens = ...

	  // Remove all listeners for Mint event of tokens
	  this.removeTokenListeners(singleTokens);

	  // Remove all listeners for Mint and Swap events of pairs we are no longer interested in
	  await this.removePairListeners();

	  // Clear the list of single tokens to fill it with other addresses
	  singleTokens = [];

	  for (let token of uniswapTokens) {

	    // Get a ETH/token pair
	    let pairAddress: string = await this.factory.getPair(WETH, token);

	    
	    // If address of the pair is a zero address - that means there is no liquidity on the pair yet
	    if (pairAddress == ethers.constants.AddressZero) {
	      token = token.toLowerCase();
	      singleTokens.push(token);
	    } else {
	      // Otherwise - update both the address of the pair and the address of the single token
	      pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
	      singleToken = await ethers.getContractAt("IERC20", token);

	      // If this token already has liquidity, don't buy it
	      if ((await pair.totalSupply()).gt(0)){
	        continue;
	      }

	      // If this token has a pair but has no liquidity, then wait till the liquidity is added and buy the token
	      this.waitMintAndBuyToken(pair, wallet, singleToken, gasPrice);
	    }
	  }
	}




	/*
	
	Main function
	
	*/


	async watch(){


		/*

		Provider block (pending transactions)

		*/

		console.log(`Bot head №${this.headNum} starts working...`);

		// Listen for pending transactions and parse them
	  this.provider.on("pending", (tx) => {

	  	// Have to pass 'this' as a parameter here to give it a type
	    this.provider.getTransaction(tx.hash).then(async function (this: BotHead, transaction) {

	      let {data} = transaction;

	      if (data != "0x"){
	        try {
	          let parsed_data = await this.parseAddLiquidityDataField(data);

	          let token = new Token(parsed_data.token);
	          // If for some reason the token is already being processed - ignore the token
	          if (this.checkBuying(token) || this.checkBought(token) || this.checkSelling(token) || this.checkSold(token)){
	            return;
	          }

	          if (this.checkParsedData(parsed_data)) {
	            console.log("(Pending) This pending AddLiquidity transaction is the one we need!");
	            let tokenContract = await ethers.getContractAt("IERC20", token.address.toLowerCase());
	            let gasPrice = await this.provider.getGasPrice();
	            await this.buyToken(this.wallet, tokenContract, gasPrice.sub(1));
	            // Only after buying token we have to wait to get pending transaction's block number
	            console.log("(Pending) Pending AddLiquidity transaction was mined at block: ", await this.getTransactionBlock(transaction.hash));

	          }
	        }catch(e){};

	        try {
	          let parsed_data = await this.parseAddLiquidityETHDataField(data);

	          let token = new Token(parsed_data.token);
	          // If for some reason the token is already being processed - ignore the token
	          if (this.checkBuying(token) || this.checkBought(token) || this.checkSelling(token) || this.checkSold(token)){
	            return;
	          }

	          if (this.checkParsedData(parsed_data)) {
	            console.log("(Pending) This pending AddLiquidityETH transaction is the one we need!");
	            let tokenContract = await ethers.getContractAt("IERC20", token.address.toLowerCase());
	            let gasPrice = await this.provider.getGasPrice();
	            await this.buyToken(this.wallet, tokenContract, gasPrice.sub(1));
	            // Only after buying token we have to wait to get pending transaction's block number
	            console.log("(Pending) Pending AddLiquidityETH transaction was mined at block: ", await this.getTransactionBlock(transaction.hash));
	          }
	        }catch(e){};

	      };

	    });

	  });


	  /*

		Factory block (pair detection)

		*/

		// Listen to the event of pair creation by someone else on the Uniswap
	  // If the pair was created - run the async function EACH time
	  // Runs in the back
	  this.factory.on("PairCreated", async function (this: BotHead, token0Address: string, token1Address: string, pairAddress: string): Promise<void> {

	    token0Address = token0Address.toLowerCase();
	    token1Address = token1Address.toLowerCase();
	    pairAddress = pairAddress.toLowerCase();
	    let tokenAddress;
	    let wethAddress;

	    if (token0Address == WETH.toLowerCase()){
	      wethAddress = token0Address;
	      tokenAddress = token1Address;

	    } else {
	      tokenAddress = token0Address;
	      wethAddress = token1Address;
	    }


	    // TODO in original main.ts that variable was global - so without let...

	    // Update the address of the single token from the pair
	    let singleToken = await ethers.getContractAt("IERC20", tokenAddress);

	    // Update the address of the whole pair of tokens
	    let pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);

	    let token = new Token(singleToken.address);

	    console.log(
	      "(PairCreated) A new pair detected:",
	      "\n(PairCreated) First token address:", token0Address,
	      "\n(PairCreated) Second token address:", token1Address,
	      "\n(PairCreated) Pair address:", pairAddress,
	    );

	    // Check if this pair is token/ETH or ETH/token

	    // TODO why is singleTokens visible here? Its not global

	    if (singleTokens.includes(tokenAddress)){
	      console.log("(PairCreated) This pair has a target token!");
	    }
	    else{
	      console.log("(PairCreated) This pair doesn't have a target token!");
	      return
	    }

	    // As soon as the pair is created - we add two listeners for it
	    // Doesn't metter if the token is being processed or not. We have to have 
	    // event listeners for that pair
	    await this.addPairListeners(token, pairAddress)

	    // Set token's pair address 
	    this.changePairAddress(token, pairAddress);

	    // "PairCreated" event could have been called inside of addLiquidity() or addLiquidityETH() transactions
	    // Check if token has been processed
	    // If it has - exit 
	   if (this.checkBuying(token) || this.checkBought(token) || this.checkSelling(token) || this.checkSold(token)){
	      // If it is - continue to another one
	      console.log("(PairCreated) Token from that pair has been processed - cancel buying!");
	      return;
	    }

	    // Check if there is any liquidity in the pair 
	    // (if any LP tokens have been minted)
	    if ((await pair.totalSupply()).eq(0)) {
	      // If there is not - wait for the pair to be minted and buy desired token from the pair
	      console.log("(PairCreated) Pair wasn't minted yet. Waiting...");
	      await this.waitMintAndBuyToken(pair, this.wallet, singleToken, this.router.getGasPrice());
	    } else {
	      // If there is - buy desired token from the pair
	      console.log("(PairCreated) Pair has already been minted - we can buy tokens from it now!");
	      await this.buyToken(this.wallet, singleToken, this.router.getGasPrice());
	    }
	    
	  });


	  // Listen for updates of the file with tokens addresses
	  chokidar.watch(YAML_FILE_WITH_TOKENS)
	    .on("add", this.buyAndUpdateSingleTokens)
	    .on("change", this.buyAndUpdateSingleTokens)
	    .on("unlink", () => {singleTokens = []});
	}

}


async function main(){
	await init();
	let firstHead = new BotHead(ethWallet, ethRouter, bscFactory, uniswapPair, ETH_SWAP_AMOUNT, 1);
	firstHead.watch();

}



main()