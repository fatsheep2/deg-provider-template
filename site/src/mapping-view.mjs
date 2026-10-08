// View model for the slot contract: what a template maps, how it decides
// direction, and which roles its legs use. Pure functions so they can be
// tested without Vue. Unknown shapes are passed through as text, never
// interpreted.

const SLOT_FIELDS = ['date', 'payee', 'narration', 'amount', 'currency', 'flag', 'tags', 'links'];

export const CORE_ROLES = ['self', 'from', 'to', 'cash', 'position', 'fee', 'pnl', 'gas', 'custody'];

function asList(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

/** @returns {{hasSlots:boolean, slots:Array<{field:string, expr:string}>, metadata:Array<{key:string, expr:string}>, direction:object, legs:Array, shape:Array<string>, vars:Array<{name:string, expr:string, when:string}>, fileFormat:string, anchors:Array<string>}} */
export function mappingModel(templateDoc) {
  const t = templateDoc?.template || {};
  const slots = t.slots && typeof t.slots === 'object' ? t.slots : null;
  const model = {
    hasSlots: !!slots, slots: [], metadata: [], direction: { kind: 'none' }, legs: [], shape: [], vars: [],
    fileFormat: String(t.fileFormat || templateDoc?.reader?.format || '').toUpperCase(), anchors: [],
  };
  if (!slots) return model;
  for (const f of SLOT_FIELDS) {
    if (slots[f] != null && String(slots[f]) !== '') model.slots.push({ field: f, expr: String(slots[f]) });
  }
  if (slots.metadata && typeof slots.metadata === 'object') {
    for (const [key, expr] of Object.entries(slots.metadata)) model.metadata.push({ key, expr: String(expr ?? '') });
  }
  const d = t.direction && typeof t.direction === 'object' ? t.direction : {};
  if (d.outflowColumn || d.inflowColumn) {
    model.direction = { kind: 'columns', outflow: String(d.outflowColumn || ''), inflow: String(d.inflowColumn || '') };
  } else if (d.column) {
    model.direction = { kind: 'column', column: String(d.column), outflow: asList(d.outflow), inflow: asList(d.inflow), fallback: d.default ? String(d.default) : '' };
  } else {
    model.direction = { kind: 'sign', invert: d.invert === true };
  }
  const varSets = Array.isArray(t.vars) ? t.vars : t.vars && typeof t.vars === 'object' ? [{ vars: t.vars }] : [];
  for (const set of varSets) {
    for (const [name, expr] of Object.entries(set?.vars || {})) model.vars.push({ name, expr: String(expr ?? ''), when: set.when ? String(set.when) : '' });
  }
  for (const branch of Array.isArray(t.legs) ? t.legs : []) {
    model.legs.push({
      id: branch?.id ? String(branch.id) : '',
      when: branch?.when ? String(branch.when) : '',
      narration: branch?.narration ? String(branch.narration) : '',
      legs: (Array.isArray(branch?.legs) ? branch.legs : []).map((l) => ({
        role: String(l?.role ?? ''),
        amount: l?.amount != null ? String(l.amount) : '',
        currency: l?.currency != null ? String(l.currency) : '',
        cost: l?.cost != null ? String(l.cost) : '',
        price: l?.price != null ? String(l.price) : '',
      })),
    });
  }
  for (const step of Array.isArray(templateDoc?.shape) ? templateDoc.shape : []) {
    if (!step || typeof step !== 'object') continue;
    const [op, arg] = Object.entries(step)[0] || [];
    if (!op) continue;
    if (op === 'locateHeader' && arg && typeof arg === 'object') model.anchors = asList(arg.anchor);
    model.shape.push(typeof arg === 'string' ? `${op}: ${arg}` : `${op}: ${JSON.stringify(arg)}`);
  }
  return model;
}

/** Role bindings from a starter rules file, in declaration order. */
export function accountsModel(rulesDoc) {
  const accounts = rulesDoc?.accounts;
  if (!accounts || typeof accounts !== 'object') return [];
  return Object.entries(accounts).map(([role, account]) => ({ role, account: String(account ?? '') }));
}

/** Roles a template's legs use, plus self for two-leg templates. */
export function rolesOf(model) {
  const roles = new Set();
  for (const b of model.legs) for (const l of b.legs) if (l.role) roles.add(l.role);
  if (!roles.size) roles.add('self');
  return [...roles];
}

/** One sentence describing the direction rule. */
export function directionText(direction, t) {
  switch (direction.kind) {
    case 'columns':
      return t('dirColumns').replace('{out}', columnName(direction.outflow)).replace('{in}', columnName(direction.inflow));
    case 'column': {
      let s = t('dirColumn').replace('{col}', columnName(direction.column)).replace('{out}', direction.outflow.join(' / ') || '—').replace('{in}', direction.inflow.join(' / ') || '—');
      if (direction.fallback) s += ' · ' + t('dirDefault').replace('{d}', t(direction.fallback === 'outflow' ? 'outflow' : 'inflow'));
      return s;
    }
    case 'sign':
      return t(direction.invert ? 'dirSignInvert' : 'dirSign');
    default:
      return '';
  }
}

/** "<交易时间>.time" -> "交易时间" for prose; anything else unchanged. */
export function columnName(expr) {
  const m = String(expr ?? '').match(/^<([^>]+)>/);
  return m ? m[1] : String(expr ?? '');
}

/** Split an expression into readable tokens: bill columns, variables, methods and literal text.
 *  @returns {Array<{kind:'column'|'var'|'method'|'text', text:string}>} */
export function exprTokens(expr) {
  const out = [];
  const re = /<var\.([^>]+)>|<([^>]+)>|((?:\.[A-Za-z_]+(?:\((?:"[^"]*"|'[^']*'|[^)])*\))?|\.[+\-!])+)/g;
  let last = 0;
  const s = String(expr ?? '');
  for (let m; (m = re.exec(s)); ) {
    if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) });
    if (m[1] != null) out.push({ kind: 'var', text: m[1] });
    else if (m[2] != null) out.push({ kind: 'column', text: m[2] });
    else out.push({ kind: 'method', text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out.filter((tok) => tok.text !== '');
}

/** Example account for a role, used as the input placeholder. */
export function roleExample(role) {
  switch (role) {
    case 'self': return 'Assets:Bank:MyBank:Checking';
    case 'from': return 'Assets:Bank:MyBank';
    case 'to': return 'Expenses:FIXME';
    case 'cash': return 'Assets:Broker:Cash';
    case 'position': return 'Assets:Broker:Positions';
    case 'fee': return 'Expenses:Broker:Commission';
    case 'pnl': return 'Income:Broker:PnL';
    case 'gas': return 'Expenses:Crypto:Gas';
    case 'custody': return 'Assets:Bank:Custody';
    default: return 'Equity:FIXME';
  }
}
