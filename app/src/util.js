export const DEF_CATS = {
  spent: ['Food', 'Travel', 'Groceries', 'Bills', 'Shopping', 'Fun', 'Health', 'Other'],
  got: ['Salary', 'Freelance', 'Gift', 'Refund', 'Other'],
};

// functional emoji vocabulary (brief: identifiers, never decoration)
export const EMOJI = {
  Food: '🍔', Travel: '🚕', Groceries: '🛒', Bills: '💡', Shopping: '🛍', Fun: '🎮', Health: '💊',
  Salary: '💼', Freelance: '🧾', Gift: '🎁', Refund: '↩', Other: '✱',
};
export const emojiFor = (cat) => EMOJI[cat] || '✱';

export const CURRENCIES = ['Rs', '₹', '$', '€'];

// top-4 most frequent spent amounts, ascending; SHEETS.md fallback when no history
export const quickAmounts = (entries) => {
  const freq = {};
  for (const e of entries) if (e.type === 'spent') freq[e.amt] = (freq[e.amt] || 0) + 1;
  const top = Object.keys(freq)
    .map(Number)
    .sort((a, b) => freq[b] - freq[a] || a - b)
    .slice(0, 4)
    .sort((a, b) => a - b);
  return top.length ? top : [4000, 10000, 25000, 50000];
};

export const fmt0 = (c) => Math.round(Math.abs(c) / 100).toLocaleString('en-US');

// whole numbers everywhere — no decimals
export const fmt = (c) => Math.round(Math.abs(c) / 100).toLocaleString('en-US');

export const parseAmt = (s) => {
  const n = parseFloat(String(s).replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const fmtDate = (d) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

export const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());

export const nextMs = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 9).getTime();
};

export const adv = (s, freq) => {
  const [y, m, d] = s.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  if (freq === 'daily') x.setDate(x.getDate() + 1);
  else if (freq === 'weekly') x.setDate(x.getDate() + 7);
  else if (freq === 'monthly') x.setMonth(x.getMonth() + 1);
  else x.setFullYear(x.getFullYear() + 1);
  return fmtDate(x);
};

export const monthKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
export const monthOf = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() * 100 + d.getMonth();
};

export const dayLabel = (k) => {
  const now = new Date();
  const y = new Date(Date.now() - 864e5);
  if (k === now.toDateString()) return 'Today';
  if (k === y.toDateString()) return 'Yesterday';
  return new Date(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export const timeLabel = (ms) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// ------------------------------------------------------------------- csv --
export const toCsv = (data, accName) => {
  const head = 'Date,Type,Category,Amount,Note,Account\n';
  const rows = data.entries.map((e) =>
    [
      new Date(e.t).toISOString(),
      e.type,
      e.cat || '',
      (e.amt / 100).toFixed(2),
      '"' + (e.note || '').replace(/"/g, '""') + '"',
      e.type === 'transfer' ? accName(e.from) + '->' + accName(e.to) : accName(e.acc),
    ].join(',')
  );
  return head + rows.join('\n');
};

const csvLine = (s) => {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
};

export const parseCsv = (text, accounts, fallbackAcc) => {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const head = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const idx = (o) => head.indexOf(o);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const r = csvLine(lines[i]);
    const get = (k) => { const j = idx(k); return j < 0 ? '' : (r[j] || '').trim(); };
    const t = get('type').toLowerCase();
    const typ = t === 'expense' || t === 'spent' ? 'spent' : t === 'income' || t === 'got' ? 'got' : t === 'invest' ? 'invest' : '';
    if (!typ) continue;
    const a = parseAmt(get('amount'));
    if (!a) continue;
    const n = get('account');
    const acc = accounts.find((x) => x.name.toLowerCase() === n.toLowerCase());
    out.push({
      t: new Date(get('date')).getTime() || Date.now(),
      type: typ,
      cat: get('category') || 'Other',
      amt: a,
      note: get('note') || undefined,
      acc: acc ? acc.id : fallbackAcc,
    });
  }
  return out;
};
