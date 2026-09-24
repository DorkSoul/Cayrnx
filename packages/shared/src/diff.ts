export interface DiffLine {
  cls: 'ctx' | 'add' | 'del';
  sign: ' ' | '+' | '−';
  text: string;
}

/** Line diff by longest common subsequence (ported from the prototype). Blank lines are ignored. */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n').filter((x) => x.trim());
  const B = b.split('\n').filter((x) => x.trim());
  const n = A.length;
  const m = B.length;
  const L: number[][] = [];
  for (let i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ cls: 'ctx', sign: ' ', text: B[j] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) {
      out.push({ cls: 'del', sign: '−', text: A[i++] });
    } else {
      out.push({ cls: 'add', sign: '+', text: B[j++] });
    }
  }
  while (i < n) out.push({ cls: 'del', sign: '−', text: A[i++] });
  while (j < m) out.push({ cls: 'add', sign: '+', text: B[j++] });
  return out;
}
