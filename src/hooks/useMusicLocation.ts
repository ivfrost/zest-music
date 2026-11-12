import { useContext } from 'react';
import { MusicLocationsContext } from '@/context/MusicLocationContext';

export default function useMusicLocations() {
  const context = useContext(MusicLocationsContext);
  if (!context) {
    throw new Error(
      'useMusicLocations must be used within a MusicLocationsProvider',
    );
  }
  return context;
}
