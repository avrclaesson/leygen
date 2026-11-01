const kr = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

export const formatKr = (n: number) => `${kr.format(Math.round(n))} kr`;
export const formatNum = (n: number) => kr.format(Math.round(n));
export const formatDec = (n: number) => dec.format(n);
export const formatPct = (n: number) => `${dec.format(n * 100)} %`;
