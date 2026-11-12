import { useContext } from 'react';
import { AudioReactContext } from '@/audio/AudioProvider';

export function useAudio() {
  const context = useContext(AudioReactContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
