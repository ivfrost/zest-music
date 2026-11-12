import { useSyncExternalStore } from 'react';

let albumId: string | null = null;
const listeners = new Set<() => void>();

function getAlbumFilter(): string | null {
  return albumId;
}

export function setAlbumFilter(next: string | null): void {
  if (albumId === next) return;
  albumId = next;
  for (const listener of listeners) listener();
}

function subscribeToAlbumFilter(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAlbumFilter(): string | null {
  return useSyncExternalStore(subscribeToAlbumFilter, getAlbumFilter);
}
