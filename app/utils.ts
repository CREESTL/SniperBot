import fs from "fs";
import glob from "glob";
import * as yaml from 'js-yaml'
import chokidar from "chokidar";
import { Signer, ContractFactory, Contract, BigNumber, providers, Wallet} from "ethers";
import hardhat from "hardhat";
let { ethers } = hardhat;
let { formatEther, parseEther } = ethers.utils;
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TransactionResponse, TransactionReceipt, Log, Provider } from "@ethersproject/abstract-provider";
import type { TransactionReceiptWithEvents, ContractData, Config, yamlToken } from "./types";
import { tokenState, Token } from "./token";

// Get a ContractFactory by a contract name from ./artifacts dir
export function getContractFactory(name: string, signer: Signer): ContractFactory {
  // Find all .json files with such name in ./artifacts
  const files: string[] = glob.sync(`./artifacts/**/${name}.json`);
  // Throw an exception if the number of files found isn't 1
  if (files.length == 0) throw `Contract ${name}.sol not found`;
  // Get the first path
  const path: string = files[0];
  // Read the file from path
  const file: Buffer = fs.readFileSync(path);
  // Parse the Buffer to ContractData
  const data: ContractData = JSON.parse(file.toString());
  // Load ContractFactory from the ContractData
  const factory: ContractFactory = new ContractFactory(data.abi, data.bytecode, signer);
  return factory;
}


// Function to load network configuration from local .yaml file
export function loadConfig(path: string): Config {
  return yaml.load(fs.readFileSync(path, 'utf-8')) as Config;
}


// Function to load single tokens from local .yaml file
export function loadSingleTokens(path: string): yamlToken{
  return yaml.load(fs.readFileSync(path, 'utf-8')) as yamlToken;
}

// Function to write tokens' addresses to local .yaml file
export function writeSingleTokens(path: string, formatedTokens:any) {
  fs.writeFileSync(path, yaml.dump(formatedTokens));
}


// =======================================
// TODO Delete these if not used

let provider: Contract;
let tokens: Token[];
let singleTokens: string[];
let UniswapPair: Contract;


// Function return the number of block the transaction was mined at
export let getTransactionBlock = async (txHash: string) => {
  // Receipt is only available for mined transactions
  let txReceipt = await provider.getTransactionReceipt(txHash);
  let blockNumber = txReceipt.blockNumber;
  return blockNumber;
}


// Function to change token's pair address
export let changePairAddress = (token: Token, pairAddress: string) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    tokens[tokens.indexOf(exactToken)].pairAddress = pairAddress;
  }
}


// Function to change token's state in global array
export let changeState = (token: Token, newState: tokenState) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    console.log(`(changeState) Changing token's ${token.address} state to ${newState}`);
    tokens[tokens.indexOf(exactToken)].state = newState;     
  }
}


// Function to set token's old price while the token in already in the list
export let changeOldPrice = (token: Token, oldPrice: BigNumber) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    tokens[tokens.indexOf(exactToken)].oldPrice = oldPrice;
  }
}

// Function to set token's current price while the token in already in the list
export let changeCurrentPrice = (token: Token, currentPrice: BigNumber) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    tokens[tokens.indexOf(exactToken)].currentPrice = currentPrice;
  }
}


// Function checks if token has already got old price
export let checkOldPriceExists = (token: Token) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if ((exactToken !== undefined) && (exactToken.oldPrice !== undefined)){
    return true;
  }
  return false;
}

// Function to check if the token is being bought
// Returns true if the token is NOT free
export let checkBuying = (token: Token) => {
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
export let checkBought = (token: Token) => {
  let exactToken = tokens.find(t => t.address.toLowerCase() == token.address.toLowerCase());
  if (exactToken !== undefined){
    if (exactToken.state == tokenState.Bought){
      return true;
    }
  }
  return false;
}


// Function to check if the token is being sold
export let checkSelling = (token: Token) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    if (exactToken.state == tokenState.Selling){
      return true;
    }
  }
  return false;
}


// Function to check if the token has already been sold
export let checkSold = (token: Token) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    if (exactToken.state == tokenState.Sold){
      return true;
    }
  }
  return false;
}


// Function to parse "data" field of addLiquidityETH transaction
export let parseAddLiquidityETHDataField = async (data: string) => {
  let abiRouter = require('../artifacts/contracts/interfaces/IUniswapV2Router02.sol/IUniswapV2Router02.json').abi;
  let uniswapRouter = new ethers.utils.Interface(abiRouter);
  let parsed_data = uniswapRouter.decodeFunctionData("addLiquidityETH", data);

  return parsed_data;
}


// Function to parse "data" field of addLiquidity transaction
export let parseAddLiquidityDataField = async (data: string) => {
  let abiRouter = require('../artifacts/contracts/interfaces/IUniswapV2Router02.sol/IUniswapV2Router02.json').abi;
  let uniswapRouter = new ethers.utils.Interface(abiRouter);
  let parsed_data = uniswapRouter.decodeFunctionData("addLiquidity", data);

  return parsed_data;
}
  

// Function to check if token from parsed data in in the list of tokens to buy
export let checkParsedData = (parsedData: any) => {
  let token = parsedData.token.toLowerCase();
  if (singleTokens.includes(token)){
    return true;
  }
  return false;
}


// Function removes all events listeners from pairs
export let removePairListeners = async () => {
  for (let token of tokens){
    let pair = await ethers.getContractAt("IUniswapV2Pair", token.pairAddress);
    pair.removeAllListeners("Mint");
    pair.removeAllListeners("Swap");
  }
}


// Function removes Mint event listeners from tokens
export let removeTokenListeners = (singleTokens: string[]) => {
  // Remove all listeners for Mint event of tokens we are no loger interested in
  singleTokens.forEach((token: string): void => {
    ethers.provider.removeAllListeners({
      address: token,
      topics: [
        UniswapPair.interface.getEventTopic("Mint"),
      ],
    });
  });
}


