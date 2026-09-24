import fs from 'node:fs';
import path from 'node:path';

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e: any) {
    if (e && e.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read ${file}: ${e?.message || e}`);
  }
}

/** Write via a temp file + rename so a crash never leaves half a JSON file. */
export function writeJson(file: string, data: unknown, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
  if (mode) fs.chmodSync(file, mode);
}

/** Debounced writer for state that changes often (tab records, viewed marks). */
export class DebouncedJson<T> {
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private file: string,
    private get: () => T,
    private ms = 300,
  ) {}
  schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.ms);
  }
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    writeJson(this.file, this.get());
  }
}
