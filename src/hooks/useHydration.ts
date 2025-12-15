'use client';

import { useState, useEffect } from 'react';

export const useHydration = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // The persist middleware will automatically start hydrating
    // but we can wait for it if needed, or just flag that we are on client
    setHydrated(true);
  }, []);

  return hydrated;
};
