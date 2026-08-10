export type HandshakeProofVerificationInput = {
  template: string;
  address: string;
  signature: string;
};

export interface HandshakeProofVerifier {
  verify(input: HandshakeProofVerificationInput): Promise<boolean>;
}
