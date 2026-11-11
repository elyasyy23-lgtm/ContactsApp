// Financial calculator engine (pure logic — unit-tested in scripts/verify.js).
// Supports + − × ÷, parentheses, decimals and the phone-calculator percent rule:
//   50%              → 0.5
//   200 + 10%        → 220   (percent applies to the left operand)
//   200 × 10%       → 20    (percent is a plain fraction)
// Input uses ASCII digits/operators (the UI shows Persian digits); the parser
// also accepts Persian/Arabic digits and ٬/٫ separators so restored/pasted
// expressions still evaluate.

const OPS = new Set(['+', '-', '*', '/', '(', ')', '%']);

/** Normalise Persian input to ASCII: digits, ٬ group sep, ٫ decimal. */
export function normalizeExpression(input) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(input ?? '')
    .replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)))
    .replace(/[×٫]/g, (ch) => (ch === '×' ? '*' : '.'))
    .replace(/[−–]/g, '-')
    .replace(/[٬,\u200c\s]/g, '');
}

/** Split an ASCII expression into tokens: numbers, operators. */
export function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const s = normalizeExpression(expr);
  while (i < s.length) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') {
      let num = '';
      let dots = 0;
      while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) {
        if (s[i] === '.') dots++;
        if (dots > 1) throw new Error('عدد نامعتبر');
        num += s[i];
        i++;
      }
      if (num === '.') throw new Error('عدد نامعتبر');
      tokens.push({ type: 'num', value: parseFloat(num) });
      continue;
    }
    if (OPS.has(ch)) {
      tokens.push({ type: ch });
      i++;
      continue;
    }
    throw new Error('کاراکتر نامعتبر');
  }
  return tokens;
}

/**
 * Recursive-descent parser. Each parse level returns { value, percent } so the
 * percent rule can see whether an operand carried a '%' suffix.
 */
export function evaluate(input) {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const parseExpr = () => {
    let left = parseTerm();
    for (;;) {
      const t = peek();
      if (!t || (t.type !== '+' && t.type !== '-')) return left;
      next();
      const right = parseTerm();
      const lv = left.percent ? left.value / 100 : left.value;
      // 200 + 10% → 200 + 20 ; 200 × 10% handled in parseTerm as 200 × 0.1
      const rv = right.percent ? (lv * right.value) / 100 : right.value;
      left = { value: t.type === '+' ? lv + rv : lv - rv, percent: false };
    }
  };

  const parseTerm = () => {
    let left = parseFactor();
    for (;;) {
      const t = peek();
      if (!t || (t.type !== '*' && t.type !== '/')) return left;
      next();
      const right = parseFactor();
      const lv = left.percent ? left.value / 100 : left.value;
      const rv = right.percent ? right.value / 100 : right.value;
      if (t.type === '/' && rv === 0) throw new Error('تقسیم بر صفر');
      left = { value: t.type === '*' ? lv * rv : lv / rv, percent: false };
    }
  };

  const parseFactor = () => {
    let node = parsePrimary();
    if (peek() && peek().type === '%') {
      next();
      node = { value: node.value, percent: true };
    }
    return node;
  };

  const parsePrimary = () => {
    const t = next();
    if (!t) throw new Error('بیان ناقص');
    if (t.type === 'num') return { value: t.value, percent: false };
    if (t.type === '-') return { value: -parseFactor().value, percent: false };
    if (t.type === '+') return { value: parseFactor().value, percent: false };
    if (t.type === '(') {
      const inner = parseExpr();
      const close = next();
      if (!close || close.type !== ')') throw new Error('پرانتز بسته نشده');
      return inner;
    }
    throw new Error('بیان نامعتبر');
  };

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('بیان نامعتبر');
  if (!Number.isFinite(result.value)) throw new Error('نتیجه نامعتبر');
  return result.percent ? result.value / 100 : result.value;
}

/**
 * Pretty result for the display: strips float noise (0.1+0.2), trims trailing
 * zeros, groups the integer part and renders digits for the locale.
 * 1234567.5 → fa "۱٬۲۳۴٬۵۶۷٫۵" / en "1,234,567.5"
 * locale defaults to 'fa' so Node unit tests keep the Persian format.
 */
export function formatCalcResult(value, locale = 'fa') {
  if (!Number.isFinite(value)) return null;
  const rounded = parseFloat(value.toPrecision(12));
  let [int, frac] = String(rounded).split('.');
  const negative = int.startsWith('-');
  if (negative) int = int.slice(1);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const out = negative ? `-${grouped}${frac ? `.${frac}` : ''}` : `${grouped}${frac ? `.${frac}` : ''}`;
  if (locale === 'en') return out;
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return out.replace(/[0-9]/g, (d) => fa[Number(d)]).replace(/\./g, '٫').replace(/,/g, '٬');
}

/**
 * Live formatting of the expression the user is typing: operator glyphs × ÷ in
 * both locales; Persian digits + ٬ grouping only in fa (en stays ASCII).
 */
export function formatExpression(expr, locale = 'fa') {
  const base = String(expr ?? '')
    .replace(/\*/g, '×')
    .replace(/\//g, '÷');
  if (locale === 'en') return base;
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return base.replace(/[0-9]/g, (d) => fa[Number(d)]);
}
