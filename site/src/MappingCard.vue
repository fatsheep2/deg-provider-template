<script setup>
import { computed } from 'vue';
import { directionText, rolesOf } from './mapping-view.mjs';

// The slot contract at a glance: which Beancount fields the template fills,
// how it tells outflow from inflow, which roles its legs use, and what the
// starter rules bind those roles to. Accounts never appear in the template
// itself, so the bindings are shown beside it, labelled as the user's side.
const props = defineProps({
  model: { type: Object, required: true },
  accounts: { type: Array, default: () => [] },
  t: { type: Function, required: true },
});

const direction = computed(() => directionText(props.model.direction, props.t));
const roles = computed(() => rolesOf(props.model));
const bound = computed(() => Object.fromEntries(props.accounts.map((a) => [a.role, a.account])));
</script>

<template>
  <section class="panel rules-block mapping">
    <div class="block-head"><h2>{{ t('mappingTitle') }}</h2><span class="chip">{{ t('slotContract') }}</span></div>
    <p class="muted">{{ t('mappingNote') }}</p>

    <div v-if="model.shape.length" class="mapping-row">
      <h3>{{ t('shapeTitle') }}</h3>
      <ol class="mapping-steps"><li v-for="(s, i) in model.shape" :key="i"><code>{{ s }}</code></li></ol>
    </div>

    <div class="mapping-row">
      <h3>{{ t('slotsTitle') }}</h3>
      <table class="mapping-table">
        <tbody>
          <tr v-for="s in model.slots" :key="s.field"><th>{{ t('slot_' + s.field) }}</th><td><code>{{ s.expr }}</code></td></tr>
          <tr v-for="m in model.metadata" :key="'m' + m.key"><th class="meta">metadata.{{ m.key }}</th><td><code>{{ m.expr || '—' }}</code></td></tr>
        </tbody>
      </table>
    </div>

    <div class="mapping-row">
      <h3>{{ t('directionTitle') }}</h3>
      <p>{{ direction }}</p>
    </div>

    <div v-if="model.vars.length" class="mapping-row">
      <h3>{{ t('varsTitle') }}</h3>
      <table class="mapping-table"><tbody>
        <tr v-for="(v, i) in model.vars" :key="i"><th>var.{{ v.name }}</th><td><code>{{ v.expr }}</code><small v-if="v.when" class="muted"> · {{ t('whenLabel') }} <code>{{ v.when }}</code></small></td></tr>
      </tbody></table>
    </div>

    <div v-if="model.legs.length" class="mapping-row">
      <h3>{{ t('legsTitle') }}</h3>
      <article v-for="(b, i) in model.legs" :key="i" class="mapping-branch">
        <header><strong>{{ b.id || t('branchDefault') }}</strong><code v-if="b.when">{{ b.when }}</code><span v-else class="muted">{{ t('branchDefault') }}</span></header>
        <ul>
          <li v-for="(l, j) in b.legs" :key="j"><span class="chip chip-role">{{ l.role }}</span> <code>{{ [l.amount, l.currency, l.cost ? (l.cost.startsWith('{') ? l.cost : '{' + l.cost + '}') : '', l.price].filter(Boolean).join(' ') || t('legAuto') }}</code></li>
        </ul>
      </article>
    </div>

    <div class="mapping-row">
      <h3>{{ t('rolesTitle') }}</h3>
      <p class="muted">{{ t('rolesNote') }}</p>
      <table class="mapping-table"><tbody>
        <tr v-for="r in roles" :key="r"><th><span class="chip chip-role">{{ r }}</span></th><td><code v-if="bound[r]">{{ bound[r] }}</code><span v-else class="muted">{{ t('roleUnbound') }}</span></td></tr>
      </tbody></table>
    </div>
  </section>
</template>
