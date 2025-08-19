// src/context/index.tsx
import React from "react";
import { UIProvider } from "./ui";
import { WebsitesProvider } from "./websites";
import { ValidatorProvider } from "./validator";

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <UIProvider>
      <WebsitesProvider>
        <ValidatorProvider>{children}</ValidatorProvider>
      </WebsitesProvider>
    </UIProvider>
  );
};
