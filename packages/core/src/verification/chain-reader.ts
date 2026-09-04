export type ReceiptLog = { address: string; topics: string[]; data: string };

export type Erc20Transfer = { token: string; from: string; to: string; amountRaw: string };

export type ReceiptView = {
  status: "success" | "reverted";
  blockTimestamp: Date;
  blockNumber?: bigint;
  erc20Transfers: Erc20Transfer[];
  transactionValueRaw: string | null;
  /**
   * The transaction envelope, when the reader could read it. `undefined` means "not read", which
   * the token-attestation verdict treats as a retry; it is never collapsed into `null`, which would
   * mean "read, and there was no target" (a contract creation).
   */
  transactionFrom?: string | null;
  transactionTo?: string | null;
  logs?: ReceiptLog[];
};

export type MissingReceiptCorroboration = "missing" | "found" | "unknown";

export interface ChainReader {
  getReceipt(txHash: string): Promise<ReceiptView | null>;
  getHeadBlockNumber?(): Promise<bigint>;
  corroborateMissingReceipt?(txHash: string): Promise<MissingReceiptCorroboration>;
}
