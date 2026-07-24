"use client";

import { createContext, useContext } from "react";

type InterceptedContextValue = {
  closeDetail: () => void;
};

export const InterceptedContext = createContext<InterceptedContextValue | null>(
  null
);

export function useInterceptedContext() {
  const context = useContext(InterceptedContext);
  if (!context) {
    throw new Error(
      "useInterceptedContext must be used within InterceptedProvider"
    );
  }
  return context;
}

export const InterceptedProvider = InterceptedContext.Provider;
