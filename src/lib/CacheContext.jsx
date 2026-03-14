'use client';

import { createContext, useContext, useRef, useCallback } from 'react';

const CacheContext = createContext(null);

export function CacheProvider({ children }) {
  const cache = useRef({});

  const get = useCallback((key) => cache.current[key], []);
  const set = useCallback((key, value) => { cache.current[key] = value; }, []);

  return (
    <CacheContext.Provider value={{ get, set }}>
      {children}
    </CacheContext.Provider>
  );
}

export function useCache() {
  return useContext(CacheContext);
}
