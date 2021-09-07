// This script is used to stream pending transactions to see what's inside them


import { Signer, ContractFactory, Contract, BigNumber, providers, Wallet } from "ethers";
import hardhat from "hardhat";
const { ethers } = hardhat;
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TransactionResponse, TransactionReceipt, Log } from "@ethersproject/abstract-provider";
import type { TransactionReceiptWithEvents, ContractData} from "./types";

// The amount of ETH to be thrown from one wallet to another to create pending transactions
const SWAP_UNITS = 1;
// Gas limit for transactions
const GAS_LIMIT = 1000000

// Constant address of Uniswap Router
const ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

const amountTokenDesired: BigNumber = ethers.utils.parseEther("1");
const amountETHDesired: BigNumber = ethers.utils.parseEther("1"); 

async function main(): Promise<void> {

	// Function connects to locally running Hardhat node and waits until the pending transaction occurs
	async function streamPendingTransactions(): Promise <void> {

		// The provider to get info from local node
		const provider = ethers.provider;

		console.log("Waiting for pending transactions...")
	  
	  // Each pending transaction is just logged
		provider.on("pending", (tx) => {
			console.log("\n\n\nPending transaction detected!");
			provider.getTransaction(tx.hash).then(function (transaction) {
			  console.log("Here is it's info: ", transaction, "\n\n\n");
			});
		});

		// Each mined block is logged (for debug)
		provider.on("block", () => {
			console.log("\n(new block mined)\n");
		})

	};


	async function createPendingTransactions(): Promise <void> {
		
		// Function sends 1ETH from one wallet to another
		async function sendSingleToken(): Promise <void>  {

			console.log("\n\n\n");

			// The provider to get info from local node
			const provider = ethers.provider;

			// Wallet == Signer
			const wallets: SignerWithAddress[] = await ethers.getSigners();

			const wallet0: SignerWithAddress = wallets[0];
			const wallet1: SignerWithAddress = wallets[1];

			// Simple description of transaction
			const tx = {
				to: wallet1.address,
				value: ethers.utils.parseEther(SWAP_UNITS.toString()),
			}


			console.log("Sending transaction...");
			const txResponse: TransactionResponse = await wallet0.sendTransaction(tx)
			// Wait for transaction to be minted
			const txReceipt: TransactionReceiptWithEvents = await txResponse.wait();
			console.log("Sent transaction received, here is the receipt: \n", txReceipt);


		}

		// Function creates a pair of tokens and adds liquidity to it
		async function createPairOfTokens(): Promise <void>{

			console.log("\n\n\n");


			// Function to locally deploy shitcoins
			async function deployShitCoin(signer: Signer): Promise <string> {
				const ShitCoin: ContractFactory = await ethers.getContractFactory("ShitCoin");
			  let shitCoin: Contract = await ShitCoin.deploy();
			  await shitCoin.deployed();
			  console.log("ShitCoin deployed successfully. Address:", shitCoin.address);

			  return shitCoin.address;
			}


			const wallets: SignerWithAddress[] = await ethers.getSigners();
			const wallet: SignerWithAddress = wallets[0];


			// In order to create a *some token* / WETH pair on local fork of Uniswap we have to deploy that token (shitcoin) first
			const shitCoinAddress: string = await deployShitCoin(wallet);


			// Get tokens contracts using local ".sol" files and addresses of deployed tokens
		  const uniswapRouter: Contract = await ethers.getContractAt("IUniswapV2Router02", ROUTER_ADDRESS);
		  const uniswapFactory: Contract = await ethers.getContractAt("IUniswapV2Factory", await uniswapRouter.factory());
		  const shitCoin: Contract = await ethers.getContractAt("ShitCoin", shitCoinAddress);
		  const WETH: Contract = await ethers.getContractAt("IERC20", await uniswapRouter.WETH());


		  console.log("WETH address is ", WETH.address);
		  console.log("ShitCoin address is ", shitCoin.address);
		  console.log("Wallet address is ", wallet.address);
		  console.log("Wallet balance is ", ethers.utils.formatEther(await wallet.getBalance()));
		  
		  // First we have to approve token transaction
		 	console.log("Approving adding liquidity...");
		  const approveShitCoinTx: TransactionResponse = await shitCoin.approve(uniswapRouter.address, amountTokenDesired);
		  await approveShitCoinTx.wait();
		  console.log("Approved!");

		  console.log("Trying to add liquidity...");
		  // TODO FAILS!!! Add mint() function to ShitCoin!!!!
		  // Add some liquidity to the token in order for the pair not to have a zero address
		  const txResponse: TransactionResponse = await uniswapRouter.addLiquidityETH(
		  		// All following amounts are measured in wei (not ETH!!!)
		  		// The token that receives that liquidity
		  		shitCoin.address,
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

		  const pairAddress: string = await uniswapFactory.getPair(WETH.address, shitCoin.address);
		  const uniswapPair: Contract = await ethers.getContractAt("IUniswapV2Pair", pairAddress);

		  console.log("Address of the pair:", pairAddress);




		  console.log("\n\n\n");

		}


		await sendSingleToken();
		await createPairOfTokens();


	}

	// First we start to listen to pending transactions events
	streamPendingTransactions();
	// Then we create those pending transactions
	createPendingTransactions();
	

}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

