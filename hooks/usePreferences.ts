import { useEffect, useSyncExternalStore } from 'react';
import {
  getPreferences,
  loadPreferences,
  subscribeToPreferences,
  updatePreferences,
} from '@/lib/preferences';

export function usePreferences() {
  const preferences = useSyncExternalStore(
    subscribeToPreferences,
    getPreferences,
  );

  useEffect(() => {
    void loadPreferences();
  }, []);

  return { preferences, updatePreferences };
}
