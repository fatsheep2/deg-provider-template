<script setup>
import { computed } from 'vue';
import { directionText, rolesOf, exprTokens, roleExample } from './mapping-view.mjs';
import { parseWhen, conditionTexts } from './rules-view.mjs';

// "How this template reads your statement", for people who have never seen
// a rules file. Columns of the bill appear as chips, ledger fields as plain
// words, and every role the template uses is explained in one line with
// an example account. The YAML itself stays behind a details fold.
const props = defineProps({
  model: { type: Object, required: true },
  accounts: { type: Array, default: () => [] },
  description: { type: String, default: '' },
  t: { type: Function, required: true },
});

const direction = computed(() => directionText(props.model.direction, props.t));
const roles = computed(() => rolesOf(props.model));
const bound = computed(() => Object.fromEntries(props.accounts.map((a) => [a.role, a.account])));
const intro = computed(() => {
  const fmt = props.model.fileFormat || '';
  const anchors = props.model.anchors;
  let s = props.t('mapIntroFormat').replace('{fmt}', fmt || props.t('unknown'));
  if (anchors.length) s += ' ' + props.t('mapIntroAnchors').replace('{cols}', anchors.join(' / '));
  return s;
});
const whenSentence = (when) => {
  const parsed = parseWhen(when);
  if (parsed.empty) return props.t('branchDefault');
  if (parsed.complex) return when;
  return conditionTexts(parsed, props.t).join(` ${parsed.join === 'or' ? props.t('joinOr') : props.t('joinAnd')} `);
};
const legAmount = (l) => [l.amount, l.currency].filter(Boolean).join(' ');
const legExtra = (l) => [l.cost ? (l.cost.startsWith('{') ? l.cost : '{' + l.cost + '}') : '', l.price].filter(Boolean).join(' ');
const roleText = (role) => props.t(role.startsWith('x-') ? 'role_custom' : 'role_' + role);
</script>

<template>
  <section class="panel mapping">
    <div class="block-head">
      <div><h2>{{ t('mappingTitle') }}</h2><p class="muted">{{ description || t('mappingNote') }}</p></div>
    </div>

    <p class="map-intro">{{ intro }}</p>

    <!-- 1. bill columns -> ledger fields -->
    <h3 class="map-h">{{ t('slotsTitle') }}</h3>
    <ol class="map-flow">
      <li v-for="s in model.slots" :key="s.field">
        <span class="map-field">{{ t('slot_' + s.field) }}</span>
        <span class="map-arrow" aria-hidden="true">←</span>
        <span class="map-expr">
          <template v-for="(tok, i) in exprTokens(s.expr)" :key="i">
            <span v-if="tok.kind === 'column'" class="chip chip-col">{{ tok.text }}</span>
            <span v-else-if="tok.kind === 'var'" class="chip chip-var">{{ tok.text }}</span>
            <span v-else-if="tok.kind === 'method'" class="map-method">{{ tok.text }}</span>
            <span v-else class="map-text">{{ tok.text }}</span>
          </template>
        </span>
      </li>
    </ol>
    <p v-if="model.metadata.length" class="muted map-meta">
      {{ t('metadataKept') }}
      <span v-for="m in model.metadata" :key="m.key" class="chip chip-meta" :title="m.expr">{{ m.key }}</span>
    </p>

    <!-- 2. direction -->
    <h3 class="map-h">{{ t('directionTitle') }}</h3>
    <p class="map-dir">{{ direction }}</p>
    <div class="map-dir-legend">
      <span><b class="dot out"></b>{{ t('dirOutLegend') }}</span>
      <span><b class="dot in"></b>{{ t('dirInLegend') }}</span>
    </div>

    <!-- 3. legs (brokers, exchanges) -->
    <template v-if="model.legs.length">
      <h3 class="map-h">{{ t('legsTitle') }}</h3>
      <p class="muted">{{ t('legsNote') }}</p>
      <div class="map-branches">
        <article v-for="(b, i) in model.legs" :key="i" class="map-branch">
          <header>
            <strong>{{ b.id || t('branchDefault') }}</strong>
            <span class="muted">{{ whenSentence(b.when) }}</span>
          </header>
          <ul>
            <li v-for="(l, j) in b.legs" :key="j">
              <span class="chip chip-role">{{ l.role }}</span>
              <span class="map-acct">{{ bound[l.role] || roleExample(l.role) }}</span>
              <span class="map-amt">{{ legAmount(l) || t('legAuto') }}</span>
              <span v-if="legExtra(l)" class="map-method">{{ legExtra(l) }}</span>
            </li>
          </ul>
        </article>
      </div>
    </template>

    <!-- 4. what the user has to fill in -->
    <h3 class="map-h">{{ t('rolesTitle') }}</h3>
    <p class="muted">{{ t('rolesNote') }}</p>
    <ul class="map-roles">
      <li v-for="r in roles" :key="r">
        <span class="chip chip-role">{{ r }}</span>
        <div>
          <div>{{ roleText(r) }}</div>
          <small class="muted">{{ t('starterBinds') }} <code>{{ bound[r] || t('roleUnbound') }}</code> · {{ t('example') }} <code>{{ roleExample(r) }}</code></small>
        </div>
      </li>
    </ul>

    <details class="map-advanced">
      <summary>{{ t('advancedTitle') }}</summary>
      <div v-if="model.shape.length" class="mapping-row">
        <h4>{{ t('shapeTitle') }}</h4>
        <ol class="mapping-steps"><li v-for="(s, i) in model.shape" :key="i"><code>{{ s }}</code></li></ol>
      </div>
      <div v-if="model.vars.length" class="mapping-row">
        <h4>{{ t('varsTitle') }}</h4>
        <table class="mapping-table"><tbody>
          <tr v-for="(v, i) in model.vars" :key="i"><th>var.{{ v.name }}</th><td><code>{{ v.expr }}</code><small v-if="v.when" class="muted"> · {{ t('whenLabel') }} <code>{{ v.when }}</code></small></td></tr>
        </tbody></table>
      </div>
      <div v-if="model.metadata.length" class="mapping-row">
        <h4>{{ t('metadataTitle') }}</h4>
        <table class="mapping-table"><tbody>
          <tr v-for="m in model.metadata" :key="m.key"><th>{{ m.key }}</th><td><code>{{ m.expr || '—' }}</code></td></tr>
        </tbody></table>
      </div>
    </details>
  </section>
</template>
