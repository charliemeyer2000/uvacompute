"use client";

import { createContext, use } from "react";

const EarlyAccessContext = createContext<{
  earlyAccessEnabled: boolean;
}>({
  earlyAccessEnabled: false,
});

export function EarlyAccessProvider({
  children,
  earlyAccessEnabled,
}: {
  children: React.ReactNode;
  earlyAccessEnabled: boolean;
}) {
  return (
    <EarlyAccessContext.Provider value={{ earlyAccessEnabled }}>
      {children}
    </EarlyAccessContext.Provider>
  );
}

export function useEarlyAccessEnabled() {
  const context = use(EarlyAccessContext);
  return context.earlyAccessEnabled;
}
