import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();


/*

TODO CHANGE THAT!

A brief explanation of how the script works:

1) When main() runs two things happen:
1.1) A listener of pair creation events activates and starts monitoring 
1.2) A listener for local "tokens.txt" file changes activates and starts monitoring
2) A list of tokens a user wants to buy is created from that "tokens.txt" file 
3) If a pair of tokens on Uniswap is created we check if it contains some token from the list
3.1) If it does and there is no liquidity in the pair yet -  we wait for the pair to be minted (liquidity added) and then buy the token
3.2) If is does and there is already some liquidity in the pair - we buy the token because it has just been created and it's profitable to buy it right now
3.3) If it does not - then the script just ignores it
4) If at any given time "tokens.txt" file changes then the list of tokens from point 2 changes for the new one
5) Check each token from the new list to see if it has a pair
5.1) If if does and there is any liquidity in the pair - do now but the tokens as it means that someone else has already bought it and it's not profitable
5.2) If it does and there is no liquidity in the pair - wait for the pair to be minted (liquidity added) and buy the token

and so on...
*/

// TODO Add the same VALUE of tokens to the pool at the beginning - not AMOUNT
// TODO Increase to 10x 
// TODO check that buying in the same block


// TODO maybe replace all token: Contract with token: Token???
// TODO move all helper-function to a different file

import fs from "fs";
import chokidar from "chokidar";
import { Signer, ContractFactory, Contract, BigNumber, providers, Wallet} from "ethers";
import hardhat from "hardhat";
let { ethers } = hardhat;
let { formatEther, parseEther } = ethers.utils;
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TransactionResponse, TransactionReceipt, Log, Provider } from "@ethersproject/abstract-provider";
import type { TransactionReceiptWithEvents, ContractData, Config } from "./types";
import { getContractFactory } from "./utils";
import { tokenState, Token } from "./token";


// Max. amount of ETH the user is ready to spend
const SWAP_AMOUNT: BigNumber = parseEther(process.env.SWAP_AMOUNT || "");
// Path to the file with the list of desired tokens(tokens that user wants to buy)
const FILE_WITH_TOKENS: string = "tokens.txt";
// Max. amount of gas that suits the user
const GAS_LIMIT: BigNumber = BigNumber.from('300000');
// Constant address of Uniswap Router in Ethereum mainnet
const ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
// How many times the price of the token should increase to sell the token
// MUST be integer!
// TODO change that to 10 before release
const PRICE_RATIO = 1;



// Global variables used in functions
// A ERC20 token without a pair
let singleToken: Contract;
// A list of single tokens
let singleTokens: string[];
// A pair of two ERC20 tokens
let pair: Contract
// Uniswap elements
let uniswapRouter: Contract;
let uniswapFactory: Contract;
let UniswapPair: ContractFactory;
// Wrapped ETH (needed to interact with ETH)
// Basically, at any line below, when you see WETH - it represents ETH
let WETH: Contract;
// ERC20 token factory
let ERC20: ContractFactory;
// A signer which can sign transactions
let wallet: SignerWithAddress;
// Current gas price
let gasPrice: BigNumber;
// Provider for Ethereum blockchain
let provider: Provider;

// List of tokens to track their state
let tokens: Token[];



// Function to initialize global variables with som values
let initGlobals = async (): Promise<void> => {

  provider = ethers.provider;

  // At first the list must be empty
  singleTokens = [];

  // Uniswap Router perfoms safety checks for swapping, adding and removing liquidity
  uniswapRouter = await ethers.getContractAt("IUniswapV2Router02", ROUTER_ADDRESS);
  // Uniswap Factory deploys Uniswap Pair contracts for any ERC20 / ERC20 pair
  uniswapFactory = await ethers.getContractAt("IUniswapV2Factory", await uniswapRouter.factory());
  // Uniswap Pair implements core swapping functionality
  UniswapPair = await getContractFactory("IUniswapV2Pair", wallet);

  // Get the first wallet to work with (user's wallet)
  let wallets: SignerWithAddress[] = await ethers.getSigners();
  // Use [0] wallet here. In any other scripts [1][2]... are used to avoid balance conflicts...
  wallet = wallets[0];

  WETH = await ethers.getContractAt("IWETH", await uniswapRouter.WETH());

  // Get the current gas price
  gasPrice = await ethers.provider.getGasPrice();

  tokens = [];
}   



// Function return the number of block the transaction was mined at
let getTransactionBlock = async (txHash: string) => {
  // Receipt is only available for mined transactions
  let txReceipt = await provider.getTransactionReceipt(txHash);
  let blockNumber = txReceipt.blockNumber;
  return blockNumber;
}


// Function to change token's pair address
let changePairAddress = (token: Token, pairAddress: string) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    tokens[tokens.indexOf(exactToken)].pairAddress = pairAddress;
  }
}


// Function to change token's state in global array
let changeState = (token: Token, newState: tokenState) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    console.log(`(changeState) Changing token's ${token.address} state to ${newState}`);
    tokens[tokens.indexOf(exactToken)].state = newState;     
  }
}


// Function to set token's old price while the token in already in the list
let changeOldPrice = (token: Token, oldPrice: BigNumber) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    tokens[tokens.indexOf(exactToken)].oldPrice = oldPrice;
  }
}

// Function to set token's current price while the token in already in the list
let changeCurrentPrice = (token: Token, currentPrice: BigNumber) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    tokens[tokens.indexOf(exactToken)].currentPrice = currentPrice;
  }
}


// Function checks if token has already got old price
let checkOldPriceExists = (token: Token) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if ((exactToken !== undefined) && (exactToken.oldPrice !== undefined)){
    return true;
  }
  return false;
}

// Function to check if the token is being bought
// Returns true if the token is NOT free
let checkBuying = (token: Token) => {
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
let checkBought = (token: Token) => {
  let exactToken = tokens.find(t => t.address.toLowerCase() == token.address.toLowerCase());
  if (exactToken !== undefined){
    if (exactToken.state == tokenState.Bought){
      return true;
    }
  }
  return false;
}


// Function to check if the token is being sold
let checkSelling = (token: Token) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    if (exactToken.state == tokenState.Selling){
      return true;
    }
  }
  return false;
}


// Function to check if the token has already been sold
let checkSold = (token: Token) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    if (exactToken.state == tokenState.Sold){
      return true;
    }
  }
  return false;
}



// Function checks if it's time to sell tokens with 10x higher price
let checkTokenPriceAndSellToken = async (token: Token) => {

  console.log("(checkTokenPriceAndSellToken) Checking token's price...");
  // We have to work with the token from tokens - not just a new one
  let exactToken = tokens.find(t => t.address == token.address);
  // If the token wasn't found in tokens - there is nothing to do here
  if (exactToken === undefined){
    return;
  }
  
  let bothPrices = await uniswapRouter.getAmountsOut(ethers.utils.parseEther('1'), [WETH.address, exactToken.address]);
  let currentPrice = bothPrices[1];

  // Change token's current price
  changeCurrentPrice(exactToken, currentPrice);

  console.log(`(checkTokenPriceAndSellToken) Token (${exactToken.address}) current price is: `, ethers.utils.formatEther(exactToken.currentPrice));
  console.log(`(checkTokenPriceAndSellToken) Token (${exactToken.address}) old price is: `, ethers.utils.formatEther(exactToken.oldPrice));
  // If new price is strictly PRICE_RATIO time more than the old one - we sell the token
  if (exactToken.currentPrice.gt(exactToken.oldPrice.mul(PRICE_RATIO))){ 
    console.log(`(checkTokenPriceAndSellToken) Token (${exactToken.address}) price is ${PRICE_RATIO}x - try to sell it!`);
    // Convert token from Token class into Contract
    let tokenContract = await ethers.getContractAt("IERC20", exactToken.address);

    await sellToken(wallet, tokenContract, gasPrice);
  }
}

// Function adds two events listeners for the pair
let addPairListeners = async (token: Token, pairAddress: string) => {
  console.log("(addPairListeners) Adding listeners for pair with address: ", pairAddress);
  let pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
  // Usually Mint and Swap events are emitted via addLiquidityETH or addLiquidity
  // And they happen almost AT THE SAME TIME
  pair.on("Mint", (sender: string, amount0: BigNumber, amount1: BigNumber) => {
    // If token still hasn't been bought when Mint occured - we don't have to buy it
    if (checkBuying(token)){
      return;
    }
    console.log("(addPairListeners) LP tokens have been minted in the pair with address: ", pair.address);
    // And only if tokens have been bought - we can sell them
    if (checkBought(token)){
      console.log("(addPairListeners) A token from that pair has been bought - we can sell it now");
      checkTokenPriceAndSellToken(token);
    }
  })
  pair.on("Swap", (sender: string, amount0In: BigNumber, amount1In: BigNumber, amount0Out: BigNumber, amount1Out: BigNumber, to: string) => {
    if (checkBuying(token)){
      return;
    }
    console.log("(addPairListeners) Swap occured in the pair with address: ", pair.address);
    if (checkBought(token)){
      console.log("(addPairListeners) A token from that pair has been bought - we can sell it now");
      checkTokenPriceAndSellToken(token);
    }
  })
}


// Function to parse "data" field of addLiquidityETH transaction
let parseAddLiquidityETHDataField = async (data: string) => {
  let abiRouter = require('../artifacts/contracts/interfaces/IUniswapV2Router02.sol/IUniswapV2Router02.json').abi;
  let uniswapRouter = new ethers.utils.Interface(abiRouter);
  let parsed_data = uniswapRouter.decodeFunctionData("addLiquidityETH", data);

  return parsed_data;
}


// Function to parse "data" field of addLiquidity transaction
let parseAddLiquidityDataField = async (data: string) => {
  let abiRouter = require('../artifacts/contracts/interfaces/IUniswapV2Router02.sol/IUniswapV2Router02.json').abi;
  let uniswapRouter = new ethers.utils.Interface(abiRouter);
  let parsed_data = uniswapRouter.decodeFunctionData("addLiquidity", data);

  return parsed_data;
}
  

// Function to check if token from parsed data in in the list of tokens to buy
let checkParsedData = (parsedData: any) => {
  let token = parsedData.token.toLowerCase();
  if (singleTokens.includes(token)){
    return true;
  }
  return false;
}


// Function removes all events listeners from pairs
let removePairListeners = async () => {
  for (let token of tokens){
    let pair = await ethers.getContractAt("IUniswapV2Pair", token.pairAddress);
    pair.removeAllListeners("Mint");
    pair.removeAllListeners("Swap");
  }
}


// Function removes Mint event listeners from tokens
let removeTokenListeners = (singleTokens: string[]) => {
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



// Function to buy a single token from the minted pair
let buyToken = async (wallet: SignerWithAddress, singleToken: Contract, gasPrice: BigNumber): Promise<void> => {

  console.log("(buyToken) Trying to buy a token with address: ", singleToken.address.toLowerCase());

  // Create a new instance of Token class with token's address
  let token = new Token(singleToken.address);

  // Check if the token has been processed
  // If it has - exit
  if (checkBuying(token) || checkBought(token) || checkSelling(token) || checkSold(token)){
    console.log("(buyToken) This token has been processed - cancel buying!");
    return;
  } else {
    console.log("(buyToken) This token is free - we can buy it!");
    // Change token's state to Buying
    token.state = tokenState.Buying;
    // And add it to the list of tokens as fast as possible
    tokens.push(token);
  }

  let path: string[] = [WETH.address, singleToken.address];

  // Swap ETH for tokens
  let swapTx: TransactionResponse = await uniswapRouter.swapExactETHForTokens(
    0, 
    path,
    wallet.address, 
    Date.now() + 1000 * 60 * 10,
    // Here we must specify the amount of ETH we are ready to spend and the gas price must be exactly 1 wei lower than
    // the gas price of adding liquidity transaction
    {value: SWAP_AMOUNT, gasPrice: gasPrice},
  );

  // Wait for the transaction to finish
  // It is important because only then there will be liquidity in the pair
  await swapTx.wait();

  console.log("(buyToken) Token buying transaction was mined at block: ", await getTransactionBlock(swapTx.hash));

  console.log(
    `(buyToken) Token bought!\n`,
    `(buyToken) Token name: ${await singleToken.name()}\n`,
    `(buyToken) Token balance of the wallet: ${formatEther(await singleToken.balanceOf(wallet.address))}\n`,
    `(buyToken) ETH balance of the wallet: ${formatEther(await wallet.getBalance())}` 
    );

  // We only have to set token's old price once
  if (!checkOldPriceExists(token)){
    // Get token/ETH price before buying the token
    // Price is BigNumber
    let bothPrices = await uniswapRouter.getAmountsOut(ethers.utils.parseEther('1'), [WETH.address, token.address]);
    let oldPrice = bothPrices[1];
    console.log("(buyToken) Old price of token is ", ethers.utils.formatEther(oldPrice), 'ETH');
    // Change token's old price while it's already in the list 
    changeOldPrice(token, oldPrice);
  }

  // Changes token's state to Bought only in that function
  changeState(token, tokenState.Bought);
 
}



// Function to sell a single token from the minted pair
let sellToken = async (wallet: SignerWithAddress, singleToken: Contract, gasPrice: BigNumber): Promise<void> => {
  console.log("(sellToken) Trying to sell a token with address: ", singleToken.address); 

  // Create a new instance of Token class with token's address
  let token = new Token(singleToken.address);

  // Check if the token has been processed before
  // If it has - exit
  if (checkSelling(token) || checkSold(token) || checkBuying(token)){
    console.log(`(sellToken)This token has been processed -  cancel selling!`);
    // If it has - no need to go further
    return;
  }

  // Change token's state to Selling in the list
  changeState(token, tokenState.Selling);

  let path: string[] = [singleToken.address, WETH.address];

  // Approve transaction of twice as much tokens as there are in the wallet (just in case)
  console.log("(sellToken) Approving selling tokens...");
  let approveTx = await singleToken.approve(uniswapRouter.address, (await singleToken.balanceOf(wallet.address)).mul(2));
  await approveTx.wait();
  console.log("(sellToken) Approved!");

  // Swap ETH for tokens
  let swapTx: TransactionResponse = await uniswapRouter.swapExactTokensForETH(
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
  changeState(token, tokenState.Sold);

  
  console.log(
  `(sellToken) Token sold!\n`,
  `(sellToken) Token name: ${await singleToken.name()}\n`,
  `(sellToken) Token balance of the wallet: ${formatEther(await singleToken.balanceOf(wallet.address))}\n`,
  `(sellToken) ETH balance of the wallet: ${formatEther(await wallet.getBalance())}`
  );
}


// Buying token is available only after the whole pair it is in is minted
// This function awaits that event
let waitMintAndBuyToken = (pair: Contract, wallet: SignerWithAddress, singleToken: Contract, gasPrice: BigNumber): void => {

    // Create a new instance of Token class with token's address and state
    // We should "lock" that token's state at "Buying" while we wait for the pair to be minted
    let token = new Token(singleToken.address, tokenState.Buying);
    // Add token to the tokens only if there is no any other token with such address that is being bought or has been bought
    if (!(checkBuying(token) || checkBought(token))){
     tokens.push(token); 
    }

    pair.once("Mint", async () => {
      console.log("(waitMintAndBuyToken) Pair has been minted!");
      // After the pair is minted we can but the token
      await buyToken(wallet, singleToken, gasPrice);
    });
}



// Main farming function
// Function updates the list of desired tokens and logs it into the file
// Runs on EACH update of tokens.txt file
const buyAndUpdateSingleTokens = async (pair: Contract, wallet: SignerWithAddress, singleToken: Contract, gasPrice: BigNumber): Promise<void> => {
  // Get tokens addresses from the local tokens.txt file
  let tokensFromFile: string[] = fs.readFileSync(FILE_WITH_TOKENS)
    .toString()
    .toLowerCase()
    .split("\n")
    .map((item: string) => item.trim())
    .filter(ethers.utils.isAddress);

  // Remove all listeners for Mint event of tokens
  removeTokenListeners(singleTokens);

  // Remove all listeners for Mint and Swap events of pairs we are no longer interested in
  await removePairListeners();

  // Clear the list of single tokens to fill it with other addresses
  singleTokens = [];

  for (let token of tokensFromFile) {

    // Get a ETH/token pair
    let pairAddress: string = await uniswapFactory.getPair(WETH.address, token);
    
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
      waitMintAndBuyToken(pair, wallet, singleToken, gasPrice);
    }
  }
}





async function main(): Promise<void> {
  console.log("*Beep* Starting the bot! *Beep* \n");

  await initGlobals();

  console.log("Wallet address is: ", wallet.address);

  // Listen for pending transactions and parse them
  provider.on("pending", (tx) => {

    provider.getTransaction(tx.hash).then(async function (transaction) {

      let {data} = transaction;

      if (data != "0x"){
        try {
          let parsed_data = await parseAddLiquidityDataField(data);

          let token = new Token(parsed_data.token);
          // If for some reason the token is already being processed - ignore the token
          if (checkBuying(token) || checkBought(token) || checkSelling(token) || checkSold(token)){
            return;
          }

          if (checkParsedData(parsed_data)) {
            console.log("(Pending) This pending AddLiquidity transaction is the one we need!");
            let tokenContract = await ethers.getContractAt("IERC20", token.address.toLowerCase());
            await buyToken(wallet, tokenContract, gasPrice.sub(1));
            // Only after buying token we have to wait to get pending transaction's block number
            console.log("(Pending) Pending AddLiquidity transaction was mined at block: ", await getTransactionBlock(transaction.hash));

          }
        }catch(e){};

        try {
          let parsed_data = await parseAddLiquidityETHDataField(data);

          let token = new Token(parsed_data.token);
          // If for some reason the token is already being processed - ignore the token
          if (checkBuying(token) || checkBought(token) || checkSelling(token) || checkSold(token)){
            return;
          }

          if (checkParsedData(parsed_data)) {
            console.log("(Pending) This pending AddLiquidityETH transaction is the one we need!");
            let tokenContract = await ethers.getContractAt("IERC20", token.address.toLowerCase());
            await buyToken(wallet, tokenContract, gasPrice.sub(1));
            // Only after buying token we have to wait to get pending transaction's block number
            console.log("(Pending) Pending AddLiquidityETH transaction was mined at block: ", await getTransactionBlock(transaction.hash));
          }
        }catch(e){};

      };

    });

  });

  // Listen to the event of pair creation by someone else on the Uniswap
  // If the pair was created - run the async function EACH time
  // Runs in the back
  uniswapFactory.on("PairCreated", async (token0Address: string, token1Address: string, pairAddress: string): Promise<void> => {

    token0Address = token0Address.toLowerCase();
    token1Address = token1Address.toLowerCase();
    pairAddress = pairAddress.toLowerCase();
    let tokenAddress;
    let wethAddress;

    if (token0Address == WETH.address.toLowerCase()){
      wethAddress = token0Address;
      tokenAddress = token1Address;

    } else {
      tokenAddress = token0Address;
      wethAddress = token1Address;
    }

    // Update the address of the single token from the pair
    singleToken = await ethers.getContractAt("IERC20", tokenAddress);

    // Update the address of the whole pair of tokens
    pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);

    let token = new Token(singleToken.address);

    console.log(
      "(PairCreated) A new pair detected:",
      "\n(PairCreated) First token address:", token0Address,
      "\n(PairCreated) Second token address:", token1Address,
      "\n(PairCreated) Pair address:", pairAddress,
    );

    // Check if this pair is token/ETH or ETH/token
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
    await addPairListeners(token, pairAddress)

    // Set token's pair address 
    changePairAddress(token, pairAddress);

    // "PairCreated" event could have been called inside of addLiquidity() or addLiquidityETH() transactions
    // Check if token has been processed
    // If it has - exit 
   if (checkBuying(token) || checkBought(token) || checkSelling(token) || checkSold(token)){
      // If it is - continue to another one
      console.log("(PairCreated) Token from that pair has been processed - cancel buying!");
      return;
    }

    // Check if there is any liquidity in the pair 
    // (if any LP tokens have been minted)
    if ((await pair.totalSupply()).eq(0)) {
      // If there is not - wait for the pair to be minted and buy desired token from the pair
      console.log("(PairCreated) Pair wasn't minted yet. Waiting...");
      await waitMintAndBuyToken(pair, wallet, singleToken, gasPrice);
    } else {
      // If there is - buy desired token from the pair
      console.log("(PairCreated) Pair has already been minted - we can buy tokens from it now!");
      await buyToken(wallet, singleToken, gasPrice);
    }
    
  });


  // Listen for updates of the file with tokens addresses
  chokidar.watch(FILE_WITH_TOKENS)
    .on("add", buyAndUpdateSingleTokens)
    .on("change", buyAndUpdateSingleTokens)
    .on("unlink", () => {singleTokens = []});

}


main();

