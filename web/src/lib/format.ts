const kr = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

export const formatKr = (n: number) => `${kr.format(Math.round(n))} kr`;
export const formatNum = (n: number) => kr.format(Math.round(n));
export const formatDec = (n: number) => dec.format(n);
export const formatPct = (n: number) => `${dec.format(n * 100)} %`;

/** Text för ett inmatningsfält, t.ex. 3400000 → "3 400 000" och 3.5 → "3,5". */
export const formatInput = (n: number, grouping = true) =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2, useGrouping: grouping }).format(n);

/** Tolkar inmatad text som ett tal. Tom text blir 0 och ogiltig text blir null. */
export function parseInput(text: string): number | null {
  const s = text.replace(/[\s  ]/g, '').replace('−', '-').replace(',', '.');
  if (s === '') return 0;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}
