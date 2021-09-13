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




import fs from "fs";
import chokidar from "chokidar";
import { Signer, ContractFactory, Contract, BigNumber, providers, Wallet } from "ethers";
import hardhat from "hardhat";
let { ethers } = hardhat;
let { formatEther, parseEther } = ethers.utils;
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TransactionResponse, TransactionReceipt, Log } from "@ethersproject/abstract-provider";
import type { TransactionReceiptWithEvents, ContractData, Config } from "./types";

// Max. amount of ETH the user is ready to spend
const SWAP_AMOUNT: BigNumber = parseEther(process.env.SWAP_AMOUNT || "");
// Path to the file with the list of desired tokens(tokens that user wants to buy)
const FILE_WITH_TOKENS: string = "tokens.txt";
// Max. amount of gas that suits the user
const GAS_LIMIT: number = 300000;


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



// Addresses of UniswapRouter in different chains
const uniswapRouterAddresses: { [key: string]: string } = {
    // In our case hardhat network is a fork of ETH mainnet - so these routers have the same address
    hardhat: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    kovan: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    rinkeby: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    bsc_mainnet: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    bsc_testnet: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
  }


// Function to initialize global variables with som values
let initGlobals = async (): Promise<void> => {

  // At first the list must be empty
  singleTokens = [];

  // Get the name of the current network and the address of the router in that network
  let network: string = hardhat.network.name;
  let routerAddress: string = uniswapRouterAddresses[network];

  // Uniswap Router perfoms safety checks for swapping, adding and removing liquidity
  uniswapRouter = await ethers.getContractAt("IUniswapV2Router02", routerAddress);
  // Uniswap Factory deploys Uniswap Pair contracts for any ERC20 / ERC20 pair
  uniswapFactory = await ethers.getContractAt("IUniswapV2Factory", uniswapRouter.factory());
  // Uniswap Pair implements core swapping functionality
  // Uniswap Pair DOES NOT need initialization (it's abstract)

  WETH = await ethers.getContractAt("IERC20", await uniswapRouter.WETH());

  // Get the first wallet to work with (user's wallet)
  let wallets: SignerWithAddress[] = await ethers.getSigners();
  wallet = wallets[0];

  // Get the current gas price
  gasPrice = await ethers.provider.getGasPrice();
  console.log("Current gas price:", ethers.utils.formatUnits(gasPrice, "gwei"));

  console.log(
    "Main wallet address:", wallet.address,
    "\nBalance of this wallet:", formatEther(await wallet.getBalance()),
    "\nGas price: ", gasPrice,
  );

} 

// Function to buy a single token from the minted pair
let buyToken = async (wallet: SignerWithAddress, singleToken: Contract, gasPrice: BigNumber): Promise<void> => {
  console.log(
    "Buying a token:",
    "\nTarget token:", singleToken.address,
    "\nBase token:", WETH,
    "\nTime:", new Date().toISOString().replace("T", " ").replace("Z", ""),
    "\n",
  );

  let path: string[] = [WETH.address, singleToken.address];

  // Swap ETH for tokens
  let swapTx: TransactionResponse = await uniswapRouter.swapExactETHForTokens(
    0, path, wallet.address, Date.now() + 1000 * 60 * 10,
    {value: SWAP_AMOUNT, gasLimit: GAS_LIMIT, gasPrice: gasPrice},
  );

  console.log("Swap transaction:", swapTx);

  console.log(
    "Swap result:\n",
    await swapTx.wait(),
    "\nTime:", new Date().toISOString().replace("T", " ").replace("Z", ""),
  );

  console.log(
    "Token info after the swap:",
    "\nBalance:", formatEther(await singleToken.balanceOf(wallet.address)),
    "\nName:", await singleToken.name(),
    "\nSymbol:", await singleToken.symbol(),
  );

  console.log("ETH balance after the swap:", formatEther(await wallet.getBalance()), "\n");
}

// Buying token is available only after the whole pair it is in is minted
// This function awaits that event
let waitMintAndBuyToken = (pair: Contract, wallet: SignerWithAddress, singleToken: Contract, gasPrice: BigNumber): void => {
    console.log("Pair wasn't minted yet. Waiting...");
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
  // Remove all listeners added for tokens
  // (if the list of tokens is empty - nothing happens here)
  singleTokens.forEach((token: string): void => {
    ethers.provider.removeAllListeners({
      address: token,
      topics: [
        UniswapPair.interface.getEventTopic("Mint"),
      ],
    });
  });


  // Get tokens addresses from the local tokens.txt file
  let tokens: string[] = fs.readFileSync(FILE_WITH_TOKENS)
    .toString()
    .toLowerCase()
    .split("\n")
    .map((item: string) => item.trim())
    .filter(ethers.utils.isAddress);

  console.log("Tokens list from the file:", tokens);

  // Clear the list of single tokens to fill it with other addresses
  singleTokens = [];

  for (let token of tokens) {

    // Get a WETH/token pair
    let pairAddress: string = await uniswapFactory.getPair(WETH.address, token);
    
    // If this token doesn't have a pair then put it in the list of single tokens
    // and wait for the pair creation in the future
    if (pairAddress == ethers.constants.AddressZero) {
      singleTokens.push(token);
    } else {
      // Otherwise - update both the address of the pair and the address of the single token
      pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
      singleToken = await ethers.getContractAt("IERC20", token);

      // If this token already has liquidity, don't buy it
      if ((await pair.totalSupply()).gt(0)) continue;

      // If this token has a pair but has no liquidity, then wait till the liquidity is added and buy the token
      waitMintAndBuyToken(pair, wallet, singleToken, gasPrice);
    }
  }
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

 
    // Check if this pair is token/WETH or WETH/token
    if (!(
      (singleTokens.includes(token0Address) && token1Address == WETH.address) ||
      (singleTokens.includes(token1Address) && token0Address == WETH.address)
    )) {
      console.log("This pair doesn't have a target token!");
      return;
    }

    // Update the address of the single token from the pair
    singleToken = await ethers.getContractAt("IERC20", token0Address == WETH.address ? token1Address : token0Address);
    // Update the address of the whole pair of tokens
    pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);

    console.log("This is an expected pair! Now it's minting. Please, wait...");

    // Check if there is any liquidity in the pair
    if ((await pair.totalSupply()).eq(0)) {
      // If there is not - wait for the pair to be minted and buy desired token from the pair
      waitMintAndBuyToken(pair, wallet, singleToken, gasPrice);
    } else {
      // If there is - buy desired token from the pair
      await buyToken(wallet, singleToken, gasPrice);
    }


    
  });



  // Listen for updates of the file with tokens addresses
  chokidar.watch(FILE_WITH_TOKENS)
    .on("add", buyAndUpdateSingleTokens)
    .on("change", buyAndUpdateSingleTokens)
    .on("unlink", () => {singleTokens = []});


  console.log("Waiting for a new pair to be created or .txt file changed...");
}


main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  });