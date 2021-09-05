import type { TransactionResponse, TransactionReceipt, Log } from "@ethersproject/abstract-provider";

export interface Event extends Log {
  event: string;
  args: Array<any>;
}

export interface TransactionReceiptWithEvents extends TransactionReceipt {
  events?: Array<Event>;
}

