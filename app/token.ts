// TODO delete unused atributes


export enum tokenState{
	Free,
	Buying,
	Bought,
	Selling,
	Sold
}



export class Token {
	state: tokenState;
	price: number;	
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
