// src/context/index.tsx
import React from "react";
import { UIProvider } from "./ui";
import { ValidatorProvider } from "./validator";
import { ThemeProvider } from "../hooks/ThemeContext";

/**
 * AppProviders
 *
 * Wrap your app with <AppProviders> in the root (e.g. src/main.tsx or src/index.tsx).
 * Order matters if providers depend on each other.
 */
export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <UIProvider>
      <ValidatorProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </ValidatorProvider>
    </UIProvider>
  );
};

// Helpful for React DevTools
AppProviders.displayName = "AppProviders";

export default AppProviders;
