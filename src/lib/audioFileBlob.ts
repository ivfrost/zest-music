import { File, FileMode } from 'expo-file-system';

/**
 * Minimal `Blob` view over an Expo `File` that reads byte ranges on demand:
 * `music-metadata` only needs `size`, `type` and `slice().arrayBuffer()`.
 * Expo's own `slice()` calls `bytesSync()`, which reads the whole file on the
 * JS thread for every slice, and parsers slice many times per file.
 */
class FileByteRange {
  readonly size: number;

  constructor(
    private readonly file: File,
    private readonly start: number,
    end: number,
  ) {
    this.size = Math.max(0, end - start);
  }

  get type(): string {
    return '';
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const bytes = new Uint8Array(this.size);
    const handle = this.file.open(FileMode.ReadOnly);

    try {
      handle.offset = this.start;

      let offset = 0;
      while (offset < this.size) {
        const chunk = await handle.readBytes(this.size - offset);
        if (chunk.length === 0) break;
        bytes.set(chunk, offset);
        offset += chunk.length;
      }

      return bytes.buffer;
    } finally {
      handle.close();
    }
  }
}

/** A `Blob`-compatible random-access view over an audio file. */
export class AudioFileBlob {
  readonly size: number;
  readonly type = '';

  constructor(private readonly file: File) {
    this.size = file.size;
  }

  slice(start = 0, end = this.size): Blob {
    const from = Math.min(Math.max(start, 0), this.size);
    const to = Math.min(Math.max(end, from), this.size);
    return new FileByteRange(this.file, from, to) as unknown as Blob;
  }
}
