 import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import fs from "fs";
import chokidar from "chokidar";
import { Signer, ContractFactory, Contract, BigNumber, providers, Wallet } from "ethers";
import hardhat from "hardhat";
const { ethers } = hardhat;
const { formatEther, parseEther } = ethers.utils;
import { getContractFactory } from "./utils";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TransactionResponse, TransactionReceipt, Log } from "@ethersproject/abstract-provider";
import type { TransactionReceiptWithEvents, ContractData } from "./types";

const SWAP_AMOUNT: BigNumber = parseEther(process.env.SWAP_AMOUNT || "");
const FILE_WITH_TOKENS: string = "tokens.txt";

const uniswapRouterAddresses: { [key: string]: string } = {
  mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  kovan: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  rinkeby: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  bsc_mainnet: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  bsc_testnet: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
}

// Main farming function
async function main(): Promise<void> {
  console.log("Start bot\n");

  // Get the name of this network
  const network: string = hardhat.network.name;

  const wallets: SignerWithAddress[] = await ethers.getSigners();
  const wallet: SignerWithAddress = wallets[0];

  const gasPrice: BigNumber = await ethers.provider.getGasPrice();
  console.log("gasPrice:", ethers.utils.formatUnits(gasPrice, "gwei"));
  console.log(formatEther(SWAP_AMOUNT));

  const routerAddress: string = uniswapRouterAddresses[network];

  console.log(
    "Main wallet address:", wallet.address,
    "\nBalance of this wallet:", formatEther(await wallet.getBalance()),
    "\nRouter address:", routerAddress,
    "\n",
  );

  // Get contract factories to attach their interfaces to addresses of contracts
  const ERC20: ContractFactory = getContractFactory("IERC20", wallet);
  const UniswapRouter: ContractFactory = getContractFactory("IUniswapV2Router02", wallet);
  const UniswapFactory: ContractFactory = getContractFactory("IUniswapV2Factory", wallet);
  const UniswapPair: ContractFactory = getContractFactory("IUniswapV2Pair", wallet);

  // Attach interfaces to addresses
  const uniswapRouter: Contract = UniswapRouter.attach(routerAddress);
  const uniswapFactory: Contract = UniswapFactory.attach(await uniswapRouter.factory());

  // Get the WBNB address
  const WBNB: string = (await uniswapRouter.WETH()).toLowerCase();
  console.log("WBNB address:", WBNB);

  // const baseTokens: string[] = [WBNB];
  let targetTokens: string[] = [];

  const buyToken = async (targetToken: Contract): Promise<void> => {
    console.log(
      "Buy a target token",
      "\nTarget token:", targetToken.address,
      "\nBase token:", WBNB,
      "\nTime:", new Date().toISOString().replace("T", " ").replace("Z", ""),
      "\n",
    );

    const path: string[] = [WBNB, targetToken.address];
    console.log(
      "Swap result:\n",
      await uniswapRouter.swapExactETHForTokens(
        0, path, wallet.address, Date.now() + 1000 * 60 * 10,
        {value: SWAP_AMOUNT, gasLimit: 800000, gasPrice: gasPrice}
      ),
      "\nTime:", new Date().toISOString().replace("T", " ").replace("Z", ""),
    );

    console.log(
      "This target token info",
      "\bBalance:", formatEther(await targetToken.balanceOf(wallet.address)),
      "\nName:", await targetToken.name(),
      "\nSymbol:", await targetToken.symbol(),
    );
    console.log("Balance BNB after swap:", formatEther(await wallet.getBalance()), "\n");
  }

  const updateTargetTokens = async (path: string): Promise<void> => {
    ethers.provider.removeAllListeners();

    uniswapFactory.on("PairCreated", async (token0Address: string, token1Address: string, pairAddress: string): Promise<void> => {
      token0Address = token0Address.toLowerCase();
      token1Address = token1Address.toLowerCase();
      pairAddress = pairAddress.toLowerCase();

      console.log(
        "A pair has been created:",
        "\nToken0:", token0Address,
        "\nToken1:", token1Address,
        "\nPair:", pairAddress,
        "\nTime:", new Date().toISOString().replace("T", " ").replace("Z", ""),
      );

      console.log(WBNB == token0Address, WBNB == token1Address, targetTokens.includes(token0Address), targetTokens.includes(token1Address));
      if (!(
        (targetTokens.includes(token0Address) && token1Address == WBNB) ||
        (targetTokens.includes(token1Address) && token0Address == WBNB)
      )) {
        console.log("This pair doesn't have a target token");
        return;
      }

      const targetToken: Contract = ERC20.attach(token0Address == WBNB ? token1Address : token0Address);
      const pair: Contract = UniswapPair.attach(pairAddress);

      console.log("This is an expected pair! Await for its Mint");
      if ((await pair.totalSupply()).eq(0)) {
        pair.once("Mint", async () => {
          await buyToken(targetToken);
        });
      } else{
        await buyToken(targetToken)
      }
    });

    // const previousTokens: string[] = targetTokens;
    targetTokens = [];
    const tokens: string[] = fs.readFileSync(path)
      .toString()
      .toLowerCase()
      .split("\n")
      .map((item: string) => item.trim())
      .filter(ethers.utils.isAddress);

    //TODO: check if token already has liquidity
    console.log("Token list is updated. Target tokens:", tokens);
    // const newTokens: string[] = targetTokens.filter((token: string) => !previousTokens.includes(token));

    for (let token of tokens) {
      const pairAddress: string = await uniswapFactory.getPair(WBNB, token);
      console.log(token, pairAddress, pairAddress == ethers.constants.AddressZero, targetTokens);

      if (pairAddress == ethers.constants.AddressZero) {
        targetTokens.push(token);
      } else {
        const pair: Contract = UniswapPair.attach(pairAddress);
        const targetToken: Contract = ERC20.attach(token);

        if ((await pair.totalSupply()).gt(0)) continue;

        pair.once("Mint", async () => {
          await buyToken(targetToken);
        });
      }
    }
  }

  chokidar.watch(FILE_WITH_TOKENS)
    .on("add", updateTargetTokens)
    .on("change", updateTargetTokens)
    .on("unlink", () => {targetTokens = []});

    // console.log(path);
    // console.log(wallet.address, SWAP_AMOUNT,await wallet.getTransactionCount());
    // TODO: add the swapExactTokensForTokens branch for WBNB
    // const token0: Contract = ERC20.attach(token0Address);
    // const token1: Contract = ERC20.attach(token1Address);
    // const amt1: BigNumber = token1.balanceOf(wallet.address);
    // await token0.approve(uniswapRouter.address, amt);
    // await uniswapRouter.swapExactTokensForTokens(amt, 0, [token0Address, token1Address], wallet.address, Date.now() + 1000 * 60 * 10);

  console.log("Waiting for creating a pair...");
}

main()
  // .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

