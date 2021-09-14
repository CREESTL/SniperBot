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

const amountTokenDesired: BigNumber = ethers.utils.parseEther("1");
const amountETHDesired: BigNumber = ethers.utils.parseEther("1"); 

// Function creates a pair of tokens and adds liquidity to it
export const createPairOfTokens = async (): Promise<void> => {

  console.log("\n\n\n");

  // Function to locally deploy test tokens (TTokens)
  const deployTToken = async (): Promise <string> => {
  	// This factory uses default ethers.getSigners()[0] (the first wallet)
  	const TToken: ContractFactory = await ethers.getContractFactory("TToken");
    let tToken: Contract = await TToken.deploy("TToken", "TT", 18); // 1 TToken = 10^18 wei
    await tToken.deployed();
    console.log("TToken deployed successfully. Address:", tToken.address);

    // Write the address of the deployed token into the local .txt file
    fs.writeFileSync(FILE_WITH_TOKENS, tToken.address);

    return tToken.address;
  }


  const wallets: SignerWithAddress[] = await ethers.getSigners();
  const wallet: SignerWithAddress = wallets[0];


  // In order to create a *some token* / WETH pair on local fork of Uniswap we have to deploy that token first
  const tTokenAddress: string = await deployTToken();


  // Get tokens contracts using local ".sol" files and addresses of deployed tokens
  const uniswapRouter: Contract = await ethers.getContractAt("IUniswapV2Router02", ROUTER_ADDRESS);
  const uniswapFactory: Contract = await ethers.getContractAt("IUniswapV2Factory", await uniswapRouter.factory());
  const tToken: Contract = await ethers.getContractAt("TToken", tTokenAddress);
  const WETH: Contract = await ethers.getContractAt("IERC20", await uniswapRouter.WETH());

  console.log("WETH address is ", WETH.address);
  console.log("TToken address is ", tToken.address);
  console.log("Wallet address is ", wallet.address);
  console.log("Wallet ETH balance is ", ethers.utils.formatEther(await wallet.getBalance()));
  console.log("UniswapFactory address is", uniswapFactory.address);
  console.log("UniswapRouter address is", uniswapRouter.address);

  // Before adding tokens to the pool, we need to have some of them on the wallet - mint them
  console.log("Minting TTokens to the wallet...")
  const mintTTokenTx: TransactionResponse = await tToken.mint(wallet.address, ethers.utils.parseEther("1000"));
  const mintTTokenReceipt: TransactionReceiptWithEvents = await mintTTokenTx.wait();
  console.log("TToken minted successfully!");

  // And then we have to approve token transaction
  console.log("Approving adding liquidity...");
  const approveTTokenTx: TransactionResponse = await tToken.approve(uniswapRouter.address, amountTokenDesired);
  await approveTTokenTx.wait();
  console.log("Approved!");

  console.log("\nTrying to add liquidity...");

  // Add some liquidity to the token in order for the pair not to have a zero address
  // This method calls mint() and createPair() inside of it
  const txResponse: TransactionResponse = await uniswapRouter.addLiquidityETH(
		// All following amounts are measured in wei (not ETH!!!)
		// The token that receives that liquidity
		tToken.address,
		// The amount of tokens to add to the pool if there is less tokens than WETH in the pool
		amountTokenDesired,
		// If WETH/token price goes up to 1/1 ratio - the transaction reverts
		ethers.utils.parseEther("1"),
		ethers.utils.parseEther("1"),
		// Recipient of the liquidity tokens
		wallet.address,
		// Deadline after which the transaction reverts
		Date.now() + 1000 * 60 * 10,
		// the amount of WETH to add to the pool if there is less WETH thatn tokens in the pool
		{value: amountETHDesired}, // Single ETH
	)


  const txReceipt: TransactionReceiptWithEvents = await txResponse.wait();

  console.log("Liquidity added!");

  // Only after adding liquidity pair has non-zerro(0x0000000....) address
  const pairAddress: string = await uniswapFactory.getPair(WETH.address, tToken.address);

  console.log("Address of the pair:", pairAddress);

  console.log("\n\n\n");

}

// Simple pair creation
let CP = async () => {
  const uniswapRouter: Contract = await ethers.getContractAt("IUniswapV2Router02", ROUTER_ADDRESS);
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