// src/context/ui.tsx
import React, { createContext, useCallback, useContext, useState } from "react";
import toast from "react-hot-toast";

interface UIContextValue {
  loading: boolean;
  setLoading: (v: boolean) => void;
  withLoading: <T>(fn: () => Promise<T>) => Promise<T>;
  notify: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
  };
}

const UIContext = createContext<UIContextValue | undefined>(undefined);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoadingState] = useState(false);

  const setLoading = useCallback((v: boolean) => setLoadingState(v), []);

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    try {
      return await fn();
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  const notify = {
    success: (msg: string) => toast.success(msg),
    error: (msg: string) => toast.error(msg),
    info: (msg: string) => toast(msg),
  };

  return (
    <UIContext.Provider value={{ loading, setLoading, withLoading, notify }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = (): UIContextValue => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
};
