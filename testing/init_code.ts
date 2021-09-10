import { bytecode } from '@uniswap/v2-core/build/UniswapV2Pair.json'
import { keccak256 } from '@ethersproject/solidity'

// Function to calculate hash of init code of UniswapV2Pair
export async function getInitCodeHashForPair(): Promise<string> {
	const COMPUTED_INIT_CODE_HASH = keccak256(['bytes'], [`0x${bytecode}`])

	return COMPUTED_INIT_CODE_HASH
}
