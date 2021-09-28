import { Signer, ContractFactory, Contract, BigNumber, providers, Wallet} from "ethers";
import hardhat from "hardhat";
const { ethers } = hardhat;
import fs from "fs";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TransactionResponse, TransactionReceipt, Log } from "@ethersproject/abstract-provider";
import type { TransactionReceiptWithEvents, ContractData} from "./types";
import { pack, keccak256 } from '@ethersproject/solidity';
import { getInitCodeHashForPair } from "./init_code";


// The amount of ETH to be thrown from one wallet to another to create pending transactions
const SWAP_UNITS = 1;
// Gas limit for transactions
const GAS_LIMIT = 1000000

// Path to the file with the list of desired tokens(tokens that user wants to buy)
const FILE_WITH_TOKENS: string = "tokens.txt";

// Constant address of Uniswap Router in Ethereum mainnet
const ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// The amount of token to add to the pair
const amountTokenDesired: BigNumber = ethers.utils.parseEther("1");
// The amount of ETH to add to the pair
const amountETHDesired: BigNumber = ethers.utils.parseEther("1"); 



// Function creates a pair of tokens and adds liquidity to it
export const createPairOfTokens = async (): Promise<void> => {

  const wallets: SignerWithAddress[] = await ethers.getSigners();
  // Use [1] wallet here not to conflict with main.ts script
  const wallet: SignerWithAddress = wallets[1];

  console.log("Wallet address is ", wallet.address.toLowerCase());

  // Function to locally deploy test tokens (TTokens)
  const deployTToken = async (): Promise <string> => {
    // This factory uses default ethers.getSigners()[0] (the first wallet)
    const TToken: ContractFactory = await ethers.getContractFactory("TToken", wallet);
    let tToken: Contract = await TToken.deploy("TToken", "TT", 18); // 1 TToken = 10^18 wei
    await tToken.deployed();
    console.log("TToken deployed successfully!");

    // Write the address of the deployed token into the local .txt file
    fs.writeFileSync(FILE_WITH_TOKENS, tToken.address);

    return tToken.address;
  }

  // In order to create a *some token* / ETH pair on local fork of Uniswap we have to deploy that token first
  const tTokenAddress: string = await deployTToken();

  // Get tokens contracts using local ".sol" files and addresses of deployed tokens
  const uniswapRouter: Contract = await ethers.getContractAt("IUniswapV2Router02", ROUTER_ADDRESS, wallet);
  const uniswapFactory: Contract = await ethers.getContractAt("IUniswapV2Factory", await uniswapRouter.factory(), wallet);
  const tToken: Contract = await ethers.getContractAt("TToken", tTokenAddress, wallet);
  const WETH: Contract = await ethers.getContractAt("IERC20", await uniswapRouter.WETH(), wallet);

  // Before adding tokens to the pool, we need to have some of them on the wallet - mint them
  console.log("Minting 1000 TTokens to the wallet...")
  const mintTTokenTx: TransactionResponse = await tToken.mint(wallet.address, ethers.utils.parseEther("1000"));
  const mintTTokenReceipt: TransactionReceiptWithEvents = await mintTTokenTx.wait();
  console.log("TToken minted successfully!");

  console.log("TToken address is ", tToken.address);
  console.log("Wallet ETH balance is ", ethers.utils.formatEther(await wallet.getBalance()));
  console.log("Wallet TToken balance is ", ethers.utils.formatEther(await tToken.balanceOf(wallet.address)));


  // And then we have to approve token transaction
  console.log("Approving adding liquidity...");
  const approveTTokenTx: TransactionResponse = await tToken.approve(uniswapRouter.address, amountTokenDesired);
  await approveTTokenTx.wait();
  console.log("Approved!");

  console.log("Adding liquidity...");

  const txResponse: TransactionResponse = await uniswapRouter.addLiquidityETH(
    // All following amounts are measured in wei (not ETH!!!)
    // The token that receives that liquidity
    tToken.address,
    // The amount of tokens to add to the pool if there is less tokens than ETH in the pool
    amountTokenDesired,
    // If ETH/token price goes up to 1/1 ratio - the transaction reverts
    ethers.utils.parseEther("0"),
    ethers.utils.parseEther("0"),
    // Recipient of the liquidity tokens
    wallet.address,
    // Deadline after which the transaction reverts
    Date.now() + 1000 * 60 * 10,
    // the amount of ETH to add to the pool if there is less ETH than tokens in the pool
    {value: amountETHDesired}, // Single ETH
  );

  const txReceipt: TransactionReceiptWithEvents = await txResponse.wait();

  console.log("Liquidity added!");

  // Only after adding liquidity pair has non-zerro(0x0000000....) address
  const pairAddress: string = await uniswapFactory.getPair(uniswapRouter.WETH(), tToken.address);
  // Create a contract of the pair of tokens to be able to mint and swap tokens
  const pair: Contract = await ethers.getContractAt("IUniswapV2Pair", pairAddress, wallet);

  console.log(`TToken balance of the wallet after adding:`, ethers.utils.formatEther(await tToken.balanceOf(wallet.address)));
  console.log(`ETH balance of the wallet after adding:`, ethers.utils.formatEther(await wallet.getBalance()));
  console.log(`TToken balance of the pair after adding:`, ethers.utils.formatEther(await tToken.balanceOf(pairAddress)));
  console.log(`ETH balance of the pair after adding:`, ethers.utils.formatEther(await WETH.balanceOf(pair.address)));


  // Now we have to add liquidity to the pair in order for token/ETH price to become 10 times greater
  console.log("Keep adding liquidity...");
  while(true){
    console.log("Approving adding liquidity...");
    const approveTTokenTx: TransactionResponse = await tToken.approve(uniswapRouter.address, amountTokenDesired);
    await approveTTokenTx.wait();
    console.log("Approved!");

    console.log("Adding liquidity...");

    const txResponse: TransactionResponse = await uniswapRouter.addLiquidityETH(
      tToken.address,
      amountTokenDesired,
      ethers.utils.parseEther("0"),
      ethers.utils.parseEther("0"),
      wallet.address,
      Date.now() + 1000 * 60 * 10,
      {value: amountETHDesired},
    );

    const txReceipt: TransactionReceiptWithEvents = await txResponse.wait();

    console.log("Liquidity added!");

    console.log(`TToken balance of the wallet after adding:`, ethers.utils.formatEther(await tToken.balanceOf(wallet.address)));
    console.log(`ETH balance of the wallet after adding:`, ethers.utils.formatEther(await wallet.getBalance()));
    console.log(`TToken balance of the pair after adding:`, ethers.utils.formatEther(await tToken.balanceOf(pairAddress)));
    console.log(`ETH balance of the pair after adding:`, ethers.utils.formatEther(await WETH.balanceOf(pair.address)));

  }
}

// Simple pair creation
let CP = async () => {
  const uniswapRouter: Contract = await ethers.getContractAt("IUniswapV2Router02", ROUTER_ADDRESS,);
  const uniswapFactory: Contract = await ethers.getContractAt("IUniswapV2Factory", await uniswapRouter.factory());

  let t1 = '0x0355B7B8cb128fA5692729Ab3AAa199C1753f726';
  let t2 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  console.log("Creating a pair of tokens...");
  let TX = await uniswapFactory.createPair(t1, t2);
  let tx = await TX.wait();
  console.log("Done!");



}


async function main(): Promise<void> {

  await createPairOfTokens(); 
  //await CP();

}

main();