import { createContext, useContext, type ReactNode } from "react";
import { usePosApp } from "./usePosApp";

export type PosAppContextValue = ReturnType<typeof usePosApp>;

const PosAppContext = createContext<PosAppContextValue | null>(null);

export function PosAppProvider({ children }: { children: ReactNode }) {
  const value = usePosApp();
  return (
    <PosAppContext.Provider value={value}>
      {children}
    </PosAppContext.Provider>
  );
}

export function usePosAppContext(): PosAppContextValue {
  const ctx = useContext(PosAppContext);
  if (!ctx) {
    throw new Error("usePosAppContext must be used within PosAppProvider");
  }
  return ctx;
}
