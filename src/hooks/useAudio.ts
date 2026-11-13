import { useContext } from 'react';
import { AudioProgressContext, AudioReactContext } from '@/audio/AudioProvider';

export function useAudio() {
  const context = useContext(AudioReactContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}

export function useAudioProgress() {
  const context = useContext(AudioProgressContext);
  if (!context) {
    throw new Error('useAudioProgress must be used within an AudioProvider');
  }
  return context;
}
