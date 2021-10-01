import type { TransactionResponse, TransactionReceipt, Log } from "@ethersproject/abstract-provider";

export interface Event extends Log {
  event: string;
  args: Array<any>;
}

export interface TransactionReceiptWithEvents extends TransactionReceipt {
  events?: Array<Event>;
}

export interface ContractFactory<ContractType> {
  attach(address: string): ContractType;
  deploy(...args: any[]): ContractType;
}

export interface ContractData {
  _format: string,
  abi: Array<any>,
  contractName: string,
  bytecode: string,
  sourceName: string,
  deployedBytecode: string,
  linkReferences: object,
  deployedLinkReferences: object,
}


// TODO make an interface for configuration that is loaded from .yaml file
// now this is done via .env
export interface Config {}

export type yamlToken = {[key: string]: string[]}