## Description

Dex-sniper-bot is a bot to make swaps immediately after creating a BNB/targetToken pair in the [pancake-swap-core](https://github.com/pancakeswap/pancake-swap-core)

### Addresses

Addresses of the Pancakeswap router in networks:

* bsc_testnet: [0xD99D1c33F9fC3444f8101754aBC46c52416550D1](https://testnet.bscscan.com/address/0xD99D1c33F9fC3444f8101754aBC46c52416550D1)
* bsc_mainnet: [0x10ED43C718714eb63d5aA57B78B54704E256024E](https://bscscan.com/address/0x10ed43c718714eb63d5aa57b78b54704e256024e)

### Copy this repository

```bash
git clone https://github.com/SamWarden/dex-sniper-bot
cd dex-sniper-bot
```

### Install dependencies

Install dependencies of this package.json:

```bash
npm i -D
```

### Create config

Use _.env_ as a local config to set private options manually:

**Don't commit it to git! (keep it secret)**

Create it from template

```bash
cp .env.template .env
```

### Scripts

To run any script enter:

```bash
npx hardhat run path/to/script.ts --network network_name
```

#### Generate a wallet

Use the script to generate a new wallet with it's own private key and address:

```bash
npx hardhat run scripts/0_create_new_wallet.ts
```

Copy generated private key (or your own private key) to _.env_ config on the corresponding line.

Add some BNB to address of this wallet. For tests you can use any _faucet_ for your network. For example [BSC Faucet](https://testnet.binance.org/faucet-smart)

### Set tokens

To add _target tokens_ you should set their addresses to this _tokens.txt_ file by separating with line breaks. 

This file can be updated while the bot is running and it will change its target tokens.

### Run bot

##### BSC Mainnet

You can specify this network

```bash
npx hardhat run app/main.ts --network bsc_mainnet
```

Or just use the default value (bsc_mainnet)

```bash
npx hardhat run app/main.ts
```

##### BSC Testnet

```bash
npx hardhat run app/main.ts --network bsc_tesnet
```
