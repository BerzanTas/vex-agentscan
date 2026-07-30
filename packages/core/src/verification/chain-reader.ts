export type ReceiptView = {
  status: "success" | "reverted";
  blockTimestamp: Date;
  erc20Transfers: { token: string; from: string; to: string; amountRaw: string }[];
};

export interface ChainReader {
  getReceipt(txHash: string): Promise<ReceiptView | null>;
}
