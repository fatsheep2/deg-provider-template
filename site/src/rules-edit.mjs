// Pure (DOM-free) rule document editing, so the card <-> YAML round trip is testable.
// RulesEditor.vue owns the refs; every mutation of the YAML text goes through here.

import { parseDocument, stringify } from 'yaml';

export function readRules(text) {
  const doc = parseDocument(String(text ?? ''));
  if (doc.errors.length) throw new Error('invalidYaml');
  const js = doc.toJS();
  if (!js || typeof js !== 'object' || !Array.isArray(js.personalRules)) {
    throw new Error('invalidStructure');
  }
  return js.personalRules;
}

export function actionsToYaml(rule) {
  return stringify(rule?.actions ?? {});
}

/** Card fields -> YAML text, patching nodes so comments and untouched keys survive.
 *  Actions come from `actionsYaml` (read from a rule) or `actions` (edited in a textarea). */
export function editRule(text, index, card) {
  const doc = parseDocument(String(text ?? ''));
  if (doc.errors.length) throw new Error('invalidYaml');
  const rawActions = card?.actionsYaml ?? card?.actions;
  if (typeof rawActions !== 'string') throw new Error('invalidActions');
  const actions = parseDocument(rawActions);
  if (actions.errors.length) throw new Error('invalidActions');
  doc.setIn(['personalRules', index, 'id'], card.id ?? '');
  if (card.when) doc.setIn(['personalRules', index, 'when'], card.when);
  else doc.deleteIn(['personalRules', index, 'when']);
  doc.setIn(['personalRules', index, 'actions'], actions.toJS() ?? {});
  return doc.toString();
}

export function addRule(text, id) {
  const doc = parseDocument(String(text ?? ''));
  if (doc.errors.length) throw new Error('invalidYaml');
  doc.addIn(['personalRules'], { id, when: '', actions: {} });
  return doc.toString();
}

export function removeRule(text, index) {
  const doc = parseDocument(String(text ?? ''));
  if (doc.errors.length) throw new Error('invalidYaml');
  doc.deleteIn(['personalRules', index]);
  return doc.toString();
}

/** YAML text -> card models, ready for the editor list.
 *  `actions` stays the readable prose from the describer; the editable YAML lives in
 *  `actionsYaml` so the two never overwrite each other. */
export function toCards(text, describe) {
  return readRules(text).map((rule) => ({ ...describe(rule), actionsYaml: actionsToYaml(rule) }));
}

/** Role bindings from the rules text, as {role: account}. Missing block -> {}. */
export function readAccounts(text) {
  const doc = parseDocument(String(text ?? ''));
  if (doc.errors.length) throw new Error('invalidYaml');
  const js = doc.toJS();
  const accounts = js && typeof js === 'object' ? js.accounts : null;
  if (!accounts || typeof accounts !== 'object') return {};
  return Object.fromEntries(Object.entries(accounts).map(([k, v]) => [k, String(v ?? '')]));
}

/** Bind one role. An empty account removes the binding so the engine falls back to FIXME. */
export function editAccount(text, role, account) {
  const doc = parseDocument(String(text ?? ''));
  if (doc.errors.length) throw new Error('invalidYaml');
  const value = String(account ?? '').trim();
  if (value) doc.setIn(['accounts', role], value);
  else if (doc.hasIn(['accounts', role])) doc.deleteIn(['accounts', role]);
  return doc.toString();
}

/** Find a rule by id. @returns {{index:number, rule:object}|null} */
export function findRule(text, id) {
  const rules = readRules(text);
  const index = rules.findIndex((r) => r && r.id === id);
  return index < 0 ? null : { index, rule: rules[index] };
}

/** Create or replace the rule with this id. `rule` omits `id`; a null rule removes it.
 *  Managed rules (output preferences) live at the end so they run after the user's own. */
export function upsertRuleById(text, id, rule) {
  const doc = parseDocument(String(text ?? ''));
  if (doc.errors.length) throw new Error('invalidYaml');
  const list = doc.get('personalRules');
  const items = list && typeof list.items !== 'undefined' ? list.items : [];
  const index = items.findIndex((n) => n && typeof n.get === 'function' && n.get('id') === id);
  if (!rule) {
    if (index >= 0) doc.deleteIn(['personalRules', index]);
    return doc.toString();
  }
  const value = { id, ...(rule.when ? { when: rule.when } : {}), actions: rule.actions || {} };
  if (index >= 0) doc.setIn(['personalRules', index], value);
  else doc.addIn(['personalRules'], value);
  return doc.toString();
}

/** Output preferences: the rules file's `output:` block (payee, narration, metadata.drop). */
export function readPreferences(text) {
  const doc = parseDocument(String(text ?? ''));
  if (doc.errors.length) throw new Error('invalidYaml');
  const out = doc.toJS()?.output;
  const o = out && typeof out === 'object' ? out : {};
  const drop = o.metadata && typeof o.metadata === 'object' ? o.metadata.drop : null;
  return {
    dropped: Array.isArray(drop) ? drop.map(String) : [],
    narration: o.narration ? String(o.narration) : '',
    payee: o.payee ? String(o.payee) : '',
  };
}

/** Write the `output:` block; an empty preference set removes it. Other keys of the file are untouched. */
export function writePreferences(text, prefs) {
  const doc = parseDocument(String(text ?? ''));
  if (doc.errors.length) throw new Error('invalidYaml');
  const narration = (prefs.narration || '').trim();
  const payee = (prefs.payee || '').trim();
  const dropped = [...(prefs.dropped || [])];
  if (!narration && !payee && !dropped.length) {
    if (doc.has('output')) doc.delete('output');
    return doc.toString();
  }
  const block = {};
  if (payee) block.payee = payee;
  if (narration) block.narration = narration;
  if (dropped.length) block.metadata = { drop: dropped };
  doc.set('output', block);
  return doc.toString();
}
