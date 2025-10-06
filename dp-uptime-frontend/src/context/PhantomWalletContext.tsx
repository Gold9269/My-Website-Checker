// src/PhantomWalletContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Per-tab Phantom provider context: stores the tab's public key in sessionStorage.
 * Prevents one tab's connect from overwriting another tab's displayed key.
 */

type WalletContextType = {
  address: string | null;
  provider?: Window["solana"];
  isInstalled: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction?: (tx: any) => Promise<any>;
  signMessage?: (msg: Uint8Array | string) => Promise<any>;
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function makeTabId() {
  try {
    const key = "phantom_tab_id";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = (typeof crypto !== "undefined" && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `tab-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `tab-${Date.now()}-${Math.floor(Math.random()*10000)}`;
  }
}

function sessionKeyFor(tabId: string) {
  return `phantom_pubkey_${tabId}`;
}

export const PhantomWalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const tabIdRef = useRef<string>(makeTabId());
  const tabKey = sessionKeyFor(tabIdRef.current);

  const [address, setAddress] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(tabKey) ?? null;
    } catch {
      return null;
    }
  });

  const [provider, setProvider] = useState<Window["solana"] | undefined>(() => {
    try {
      return (window as any).solana ?? undefined;
    } catch {
      return undefined;
    }
  });
  const [isConnecting, setIsConnecting] = useState(false);

  const writeTabKey = (pk: string | null) => {
    try {
      if (pk) sessionStorage.setItem(tabKey, pk);
      else sessionStorage.removeItem(tabKey);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const p = (window as any).solana;
    if (p && p.isPhantom) {
      setProvider(p);

      // Try trusted connect only to populate this tab's session key if available
      (async () => {
        try {
          const res = await p.connect?.({ onlyIfTrusted: true }).catch(() => null);
          const pk = res?.publicKey?.toString?.() ?? null;
          if (pk) {
            writeTabKey(pk);
            setAddress(pk);
          }
        } catch {
          // ignore
        }
      })();

      const handleConnect = (arg?: any) => {
        try {
          const pk = arg?.toString ? arg.toString() : arg?.publicKey?.toString?.() ?? p.publicKey?.toString?.() ?? null;
          writeTabKey(pk ?? null);
          setAddress(pk ?? null);
        } catch {
          const pk2 = p.publicKey?.toString?.() ?? null;
          writeTabKey(pk2);
          setAddress(pk2);
        }
      };

      const handleDisconnect = () => {
        writeTabKey(null);
        setAddress(null);
      };

      const handleAccountChanged = (arg?: any) => {
        try {
          if (!arg) {
            writeTabKey(null);
            setAddress(null);
            return;
          }
          const pk = arg?.toString ? arg.toString() : String(arg);
          writeTabKey(pk);
          setAddress(pk);
        } catch {
          // ignore
        }
      };

      p.on("connect", handleConnect);
      p.on("disconnect", handleDisconnect);
      p.on("accountChanged", handleAccountChanged);

      return () => {
        p.removeListener?.("connect", handleConnect);
        p.removeListener?.("disconnect", handleDisconnect);
        p.removeListener?.("accountChanged", handleAccountChanged);
      };
    } else {
      setProvider(undefined);
      setAddress((prev) => {
        try {
          return sessionStorage.getItem(tabKey) ?? prev ?? null;
        } catch {
          return prev ?? null;
        }
      });
    }
    // run on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    if (!provider) throw new Error("Phantom provider not found. Install Phantom Wallet.");
    try {
      setIsConnecting(true);
      const res = await provider.connect();
      const pk = res?.publicKey?.toString?.() ?? provider.publicKey?.toString?.() ?? null;
      if (pk) {
        writeTabKey(pk);
        setAddress(pk);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!provider) {
      writeTabKey(null);
      setAddress(null);
      return;
    }
    try {
      await provider.disconnect?.();
    } catch {
      // ignore
    } finally {
      writeTabKey(null);
      setAddress(null);
    }
  };

  const signTransaction = async (tx: any) => {
    if (!provider?.signTransaction) throw new Error("Provider doesn't support signTransaction");
    return provider.signTransaction(tx);
  };

  const signMessage = async (msg: Uint8Array | string) => {
    if (!provider?.signMessage) throw new Error("Provider doesn't support signMessage");
    return provider.signMessage(msg);
  };

  const value = useMemo(
    () => ({
      address,
      provider,
      isInstalled: Boolean(provider),
      isConnecting,
      connect,
      disconnect,
      signTransaction,
      signMessage,
    }),
    [address, provider, isConnecting]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const usePhantom = (): WalletContextType => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("usePhantom must be used within <PhantomWalletProvider>");
  return ctx;
};
