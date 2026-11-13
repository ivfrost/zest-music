import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type SafFileHandle = {
  /** Keeps the descriptor alive; pass it to closeSafFileDescriptor. */
  handle: number;
  /** `/proc/self/fd/<fd>` — a real path the audio engine can open. */
  path: string;
  /** Size reported by the provider; zero means the descriptor is not a regular file. */
  size: number;
};

type SafFileDescriptorModuleType = {
  open(uri: string): Promise<SafFileHandle>;
  close(handle: number): Promise<void>;
  closeAll(): void;
};

let nativeModule: SafFileDescriptorModuleType | null = null;

function getModule(): SafFileDescriptorModuleType | null {
  if (Platform.OS !== 'android') return null;
  if (nativeModule) return nativeModule;

  try {
    nativeModule =
      requireNativeModule<SafFileDescriptorModuleType>('SafFileDescriptor');
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

/**
 * Opens a SAF `content://` URI as a file descriptor and returns a path that
 * native code can open in place. Returns null when the provider cannot supply a
 * descriptor (for example a cloud provider), so callers fall back to copying.
 */
export async function openSafFileDescriptor(
  uri: string,
): Promise<SafFileHandle | null> {
  const module = getModule();
  if (!module) return null;

  try {
    return await module.open(uri);
  } catch (error) {
    console.warn('[SafFileDescriptor] Could not open descriptor', {
      uri,
      error,
    });
    return null;
  }
}

/** Closes the descriptor. Safe to call with a handle that was already closed. */
export async function closeSafFileDescriptor(handle: number): Promise<void> {
  const module = getModule();
  if (!module) return;

  try {
    await module.close(handle);
  } catch (error) {
    console.warn('[SafFileDescriptor] Could not close descriptor', {
      handle,
      error,
    });
  }
}
