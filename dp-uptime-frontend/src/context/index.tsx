// src/context/index.tsx
import React from "react";
import { UIProvider } from "./ui";
import { ValidatorProvider } from "./validator";

/**
 * AppProviders
 *
 * Wrap your app with <AppProviders> in the root (e.g. src/main.tsx or src/index.tsx).
 * Order matters if providers depend on each other. Keep ValidatorProvider where it is
 * unless you intentionally want to change provider ordering.
 */
export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <UIProvider>
        <ValidatorProvider>{children}</ValidatorProvider>
    </UIProvider>
  );
};

export default AppProviders;
