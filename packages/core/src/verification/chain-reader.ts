export type ReceiptLog = { address: string; topics: string[]; data: string };

export type ReceiptView = {
  status: "success" | "reverted";
  blockTimestamp: Date;
  blockNumber?: bigint;
  erc20Transfers: { token: string; from: string; to: string; amountRaw: string }[];
  transactionValueRaw: string | null;
  logs?: ReceiptLog[];
};

export interface ChainReader {
  getReceipt(txHash: string): Promise<ReceiptView | null>;
  getHeadBlockNumber?(): Promise<bigint>;
}
