'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

export const useHydration = () =>
  useSyncExternalStore(subscribe, () => true, () => false);
