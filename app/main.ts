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

// TODO check all swapExact transactions amount in - why is it 0?
// TODO maybe replace all token: Contract with token: Token???
// TODO add more console.log for user
// TODO Calculate OldPrice right after a token has been added to tokens and await tx.wait(). That means that there 100% is a pair with such tokens and liquidity in it.
// TODO call checkTonePricesAndSellTokens on each Swap, Mint event

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
const GAS_LIMIT: number = 300000;
// Constant address of Uniswap Router in Ethereum mainnet
const ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";



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
// Wrapped ETH
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
  // Uniswap Pair DOES NOT need initialization (it's abstract)


  // Get the first wallet to work with (user's wallet)
  let wallets: SignerWithAddress[] = await ethers.getSigners();
  wallet = wallets[0];

  WETH = await ethers.getContractAt("IERC20", await uniswapRouter.WETH());

  // Get the current gas price
  gasPrice = await ethers.provider.getGasPrice();
  console.log("Current gas price:", ethers.utils.formatEther(gasPrice), "ETH");

  console.log(
    "Main wallet address:", wallet.address,
    "\nBalance of this wallet:", formatEther(await wallet.getBalance())
  );

  tokens = [];
}   



// Function to change token's state in global array
let changeState = (token: Token, newState: tokenState) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
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

// Function to check if the token is being bought or has already been bought
// Returns true if the token is NOT free
let checkBuying = (token: Token) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    if ((exactToken.state == tokenState.Buying) || (exactToken.state = tokenState.Bought)){
      return true;
    }
  }
  return false;
}

// Function to check is the token is being sold or has already been sold
let checkSelling = (token: Token) => {
  let exactToken = tokens.find(t => t.address == token.address);
  if (exactToken !== undefined){
    if ((exactToken.state == tokenState.Buying) || (exactToken.state == tokenState.Bought)){
      return true;
    }
  }
  return false;
}


// Function checks if it's time to sell tokens with 10x higher price
let checkTokensPriceAndSellTokens = async () => {
  for (let token of tokens) {
    let currentPrice = await uniswapRouter.getAmountsOut(ethers.utils.parseEther('1'), [WETH.address, token.address]);
    token.currentPrice = currentPrice;
    // If new price is strictly 10+ time more than the old one
    if (token.currentPrice.gt(token.oldPrice.mul(10))){
      // Convert token from Token class into Contract
      let tokenContract = await ethers.getContractAt("IERC20", token.address);

      // We should not wait for the sell to finish because we have to move on to other tokens in the list
      sellToken(wallet, tokenContract, gasPrice);
    }
  }
}




// Function to buy a single token from the minted pair
let buyToken = async (wallet: SignerWithAddress, singleToken: Contract, gasPrice: BigNumber): Promise<void> => {

  console.log("tokens are: \n", tokens);

  console.log(
    "Buying a token:",
    "\nTarget token:", singleToken.address.toLowerCase(),
    "\nBase token:", WETH.address.toLowerCase(),
    "\nTime:", new Date().toISOString().replace("T", " ").replace("Z", "")
  );


  // Create a new instance of Token class with token's address
  let token = new Token(singleToken.address);

  // The processing of that same token could have been started in waitMintAndBuyToken()
  // If it hasn't - add the token to the global list
  if (!(checkBuying(token))){
    // Change token's state to Buying
    token.state = tokenState.Buying;
    // And add it to the list of tokens as fast as possible
    tokens.push(token);
    console.log("a new token added to tokens!!!"); 
  }

  let path: string[] = [WETH.address, singleToken.address];

  // Swap ETH for tokens
  let swapTx: TransactionResponse = await uniswapRouter.swapExactETHForTokens(
    0, path, wallet.address, Date.now() + 1000 * 60 * 10,
    {value: SWAP_AMOUNT, gasLimit: GAS_LIMIT, gasPrice: gasPrice},
  );
  // Wait for the transaction to finish
  // It is important because only then there will be liquidity in the pair
  await swapTx.wait();

  // Changes token's state to Bought only in that function
  changeState(token, tokenState.Bought);

  // Get token/WETH price before buying the token
  // Price is BigNumber
  let bothPrices = await uniswapRouter.getAmountsOut(ethers.utils.parseEther('1'), [WETH.address, token.address]);
  let oldPrice = bothPrices[1];
  console.log("Old price of token is ", ethers.utils.formatEther(oldPrice), 'ETH');
  // Change token's old price while it's already in the list 
  changeOldPrice(token, oldPrice);

  console.log("Got it!");
  console.log("Swap transaction:", swapTx);

  console.log(
    "Token info after the swap:",
    "\nBalance:", formatEther(await singleToken.balanceOf(wallet.address)),
    "\nName:", await singleToken.name(),
    "\nSymbol:", await singleToken.symbol(),
  );

  console.log("ETH balance after the swap:", formatEther(await wallet.getBalance()), "\n");
}



// Function to sell a single token from the minted pair
let sellToken = async (wallet: SignerWithAddress, singleToken: Contract, gasPrice: BigNumber): Promise<void> => {
  console.log(
    "Selling a token:",
    "\nTarget token:", singleToken.address,
    "\nBase token:", WETH.address,
    "\nTime:", new Date().toISOString().replace("T", " ").replace("Z", ""),
    "\n",
  );


  // Create a new instance of Token class with token's address
  let token = new Token(singleToken.address);

  // Check if the token hasn't been sold yet (just in case)
  if (checkSelling(token)){
     // If it has - no need to go further
     return;
  }

  // Change token's state to Selling in the list
  changeState(token, tokenState.Selling);

  let path: string[] = [singleToken.address, WETH.address];

  // Swap ETH for tokens
  let swapTx: TransactionResponse = await uniswapRouter.swapExactTokensForETH(
    singleToken.balanceOf(wallet.address), 
    1,
    path, 
    wallet.address, 
    Date.now() + 1000 * 60 * 10,
    {value: SWAP_AMOUNT, gasLimit: GAS_LIMIT, gasPrice: gasPrice},
  );

  // Wait for the transaction to finish
  await swapTx.wait();

  // Changes token's state to Sold only in that function
  changeState(token, tokenState.Sold);

  console.log("Got it!");
  console.log("Swap transaction:", swapTx);

  console.log("ETH balance after the swap:", formatEther(await wallet.getBalance()), "\n");
}


// Buying token is available only after the whole pair it is in is minted
// This function awaits that event
let waitMintAndBuyToken = (pair: Contract, wallet: SignerWithAddress, singleToken: Contract, gasPrice: BigNumber): void => {
    console.log("Pair wasn't minted yet. Waiting...");

    // Create a new instance of Token class with token's address and state
    // We should "lock" that token's state at "Buying" while we wait for the pair to be minted
    let token = new Token(singleToken.address, tokenState.Buying);
    if (!(checkBuying(token))){
     tokens.push(token); 
    }

    pair.once("Mint", async () => {
      console.log("Pair has been minted!");
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

  console.log("Updated tokens list from the file:", tokensFromFile);

  // Clear the list of single tokens to fill it with other addresses
  singleTokens = [];

  for (let token of tokensFromFile) {

    // Get a WETH/token pair
    let pairAddress: string = await uniswapFactory.getPair(WETH.address, token);
    
    // If address of the pair is a zero address - that means there is no liquidity on the pair yet
    if (pairAddress == ethers.constants.AddressZero) {
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





async function main(): Promise<void> {
  console.log("*Beep* Starting the bot! *Beep* \n");

  await initGlobals();

  // Listen to the event of pair creation by someone else on the Uniswap
  // If the pair was created - run the async function EACH time
  // Runs in the back
  uniswapFactory.on("PairCreated", async (token0Address: string, token1Address: string, pairAddress: string): Promise<void> => {

    token0Address = token0Address.toLowerCase();
    token1Address = token1Address.toLowerCase();
    pairAddress = pairAddress.toLowerCase();

    console.log(
      "A new pair detected:",
      "\nToken0:", token0Address,
      "\nToken1:", token1Address,
      "\nPair:", pairAddress,
      "\nTime:", new Date().toISOString().replace("T", " ").replace("Z", ""),
    );
  
    console.log("tokens are: \n", tokens);

    // Check if this pair is token/WETH or WETH/token
    if (!(
      (singleTokens.includes(token0Address) && token1Address == WETH.address.toLowerCase()) ||
      (singleTokens.includes(token1Address) && token0Address == WETH.address.toLowerCase())
    )) {
      console.log("This pair doesn't have a target token!");
      return;
    }

    // Update the address of the single token from the pair
    singleToken = await ethers.getContractAt("IERC20", token0Address == WETH.address ? token1Address : token0Address);
    // Update the address of the whole pair of tokens
    pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);

    let token = new Token(singleToken.address);

    // "PairCreated" event could have been called inside of addLiquidity() or addLiquidityETH() transactions
    // If so - that means that the token is already being processed - ignore it
    if (checkBuying(token)){
      // If it is - continue to another one
      return;
    }

    // Check if there is any liquidity in the pair
    if ((await pair.totalSupply()).eq(0)) {
      // If there is not - wait for the pair to be minted and buy desired token from the pair
      await waitMintAndBuyToken(pair, wallet, singleToken, gasPrice);
    } else {
      // If there is - buy desired token from the pair
      await buyToken(wallet, singleToken, gasPrice);
    }
    
  });

  // Listen for pending transactions and parse them
  provider.on("pending", (tx) => {
    console.log("Pending transaction detected!");
    provider.getTransaction(tx.hash).then(async function (transaction) {

      let {data} = transaction;

      // TODO find a more fancy way to handle this

      if (data != "0x"){

        try {
          let parsed_data = await parseAddLiquidityDataField(data);
          console.log("Parsed data is ", parsed_data);

          // If for some reason the token is already being processed - ignore the token
          let token = new Token(parsed_data.token);
          if (checkBuying(token)){
            return;
          }

          if (checkParsedData(parsed_data)) {
            console.log("This AddLiquidity transaction is the one we need!");
            let tokenContract = await ethers.getContractAt("IERC20", token.address.toLowerCase());
            await tx.wait();
            await buyToken(wallet, tokenContract, gasPrice.sub(1));

          }
        }catch(e){};

        try {
          let parsed_data = await parseAddLiquidityETHDataField(data);
          console.log("Parsed data is ", parsed_data);

           // If for some reason the token is already being processed - ignore the token
          let token = new Token(parsed_data.token);
          if (checkBuying(token)){
            return;
          }

          if (checkParsedData(parsed_data)) {
            console.log("This AddLiquidityETH transaction is the one we need!");
            let tokenContract = await ethers.getContractAt("IERC20", token.address.toLowerCase());
            await buyToken(wallet, tokenContract, gasPrice.sub(1));
          }
        }catch(e){};

      };
    });
  });


  // Each mined block is logged (for debug)
  provider.on("block", () => {
    console.log("(new block mined)");
  })


  // Listen for updates of the file with tokens addresses
  chokidar.watch(FILE_WITH_TOKENS)
    .on("add", buyAndUpdateSingleTokens)
    .on("change", buyAndUpdateSingleTokens)
    .on("unlink", () => {singleTokens = []});

  // Check if it's time to sell any of tokens (and sell it)
  checkTokensPriceAndSellTokens();


  console.log("Waiting for a new pair to be created or .txt file changed...");
}


main();

