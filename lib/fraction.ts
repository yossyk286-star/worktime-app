
// lib/fraction.ts

export type Fraction = { num: number; den: number }; // 分数: numerator/denominator

// 最大公約数（ユークリッドの互除法）
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

// 既約分数へ
export function reduce({ num, den }: Fraction): Fraction {
  if (den === 0) throw new Error("分母が 0 です");
  const g = gcd(num, den);
  // 分母を必ず正にする
  const sign = den < 0 ? -1 : 1;
  return { num: sign * (num / g), den: sign * (den / g) };
}

// 帯分数（整数部 + 真分数）へ
export function toMixed(f: Fraction): { whole: number; frac: Fraction } {
  const r = reduce(f);
  const whole = Math.trunc(r.num / r.den);
  const rem = r.num - whole * r.den;
  return { whole, frac: reduce({ num: rem, den: r.den }) };
}

// 小数へ
export function toDecimal(f: Fraction): number {
  const r = reduce(f);
  return r.num / r.den;
}
``
