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



async function main(): Promise<void> {

	// Function connects to locally running Hardhat node and waits until the pending transaction occurs
	async function streamPendingTransactions(): Promise <void> {

		// The provider to get info from local node
		const provider = ethers.provider;

		console.log("Waiting for pending transactions...")
	  
	  // Each pending transaction is just logged
		provider.on("pending", (tx) => {
			console.log("Pending transaction detected!");
			provider.getTransaction(tx.hash).then(function (transaction) {
			  console.log("Here is it's info: ", transaction);
			});
		});

		// Each mined block is logged (for debug)
		provider.on("block", () => {
			console.log("(new block mined)");
		})

	};

	// TODO make a transaction that creates a pair of tokens and see what's the difference
	
	// Function sends 1ETH from one wallet to another
	async function createPendingTransactions(): Promise <void> {

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

