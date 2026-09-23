"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Carries a case code from one page to the next during client-side
// navigation (Home's "Track" form and the report confirmation → /track).
// It lives in React memory only: never in the URL, history state, storage or
// cookies, so a refresh or a new tab starts empty.

interface HandoffStore {
  /** Leaves a code for the next page. */
  leave: (code: string) => void;
  /** The code left by the previous page, if any. Pure: safe in a useState initializer. */
  peek: () => string | null;
  /** Forgets it, so it's offered only once (call from an effect). */
  clear: () => void;
}

function createStore(): HandoffStore {
  let code: string | null = null;
  return {
    leave: (next) => {
      code = next;
    },
    peek: () => code,
    clear: () => {
      code = null;
    },
  };
}

const HandoffContext = createContext<HandoffStore | null>(null);

export function CaseCodeHandoffProvider({ children }: { children: ReactNode }) {
  // One store per page load; using it never re-renders anything.
  const [store] = useState(createStore);
  return <HandoffContext.Provider value={store}>{children}</HandoffContext.Provider>;
}

export function useCaseCodeHandoff(): HandoffStore {
  const store = useContext(HandoffContext);
  if (!store) throw new Error("CaseCodeHandoffProvider is missing from the layout");
  return store;
}
