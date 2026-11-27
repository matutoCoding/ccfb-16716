export function uid(prefix = 'id'): string {
  const rand = crypto?.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(filename: string, url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}
