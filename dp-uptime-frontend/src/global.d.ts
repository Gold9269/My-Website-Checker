// src/global.d.ts
export type PhantomEvent = "connect" | "disconnect" | "accountChanged";

export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  on: (evt: PhantomEvent, cb: (arg?: any) => void) => void;
  removeListener?: (evt: PhantomEvent, cb: (arg?: any) => void) => void;
  signTransaction?: (tx: any) => Promise<any>;
  signAllTransactions?: (txs: any[]) => Promise<any[]>;
  signMessage?: (msg: Uint8Array | string) => Promise<any>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}
