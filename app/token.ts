// TODO delete unused atributes
import { BigNumber } from "ethers";

export enum tokenState{
	Buying,
	Bought,
	Selling,
	Sold
}



export class Token {
	state: tokenState;
	oldPrice: BigNumber;
	currentPrice: BigNumber;
	pairAddress: string;	
	address: string;
	constructor(initAddress: string, initState?: tokenState){
		if (initState !== undefined){
			this.state = initState;
		}
		if (initAddress !== undefined){
			this.address = initAddress;
		}
	}
}
