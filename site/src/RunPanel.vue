<script setup>
import { computed, ref } from 'vue';
import CodeBlock from './CodeBlock.vue';
import { loadRuntime } from './runtime.mjs';

// Try the template on a statement, in the browser. The Go importer runs as
// WebAssembly; the file never leaves the page. Output is the same Beancount
// text the CLI would write, so what people see here is what they will get.
const props = defineProps({
  template: { type: String, default: '' },
  rules: { type: String, default: '' },
  sample: { type: Object, default: null }, // { publicPath, name }
  assetUrl: { type: Function, required: true },
  t: { type: Function, required: true },
});

const state = ref('idle'); // idle | loading | running | done | error
const result = ref(null);
const error = ref('');
const source = ref('');
const picker = ref(null);
const lines = computed(() => (result.value?.beancount || '').split('\n'));
const fixmeLines = computed(() => lines.value.filter((l) => /:FIXME\b/.test(l)).length);

async function run(name, bytes) {
  error.value = '';
  result.value = null;
  try {
    state.value = 'loading';
    const api = await loadRuntime(props.assetUrl);
    state.value = 'running';
    const out = await api.import(props.template, props.rules, name, bytes);
    if (!out.ok) throw new Error(out.error || 'runtimeError');
    result.value = out;
    state.value = 'done';
  } catch (e) {
    error.value = e?.message || String(e);
    state.value = 'error';
  }
}

async function runSample() {
  if (!props.sample) return;
  source.value = props.sample.name;
  const res = await fetch(props.assetUrl(props.sample.publicPath));
  if (!res.ok) {
    error.value = props.t('loadError');
    state.value = 'error';
    return;
  }
  await run(props.sample.name, new Uint8Array(await res.arrayBuffer()));
}

async function runFile(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  source.value = f.name;
  await run(f.name, new Uint8Array(await f.arrayBuffer()));
}

async function copyOut() {
  try {
    await navigator.clipboard.writeText(result.value?.beancount || '');
  } catch {}
}
</script>

<template>
  <section class="panel run-panel">
    <div class="block-head">
      <div><h2>{{ t('runTitle') }}</h2><p class="muted">{{ t('runNote') }}</p></div>
    </div>
    <div class="actions">
      <button class="primary" :disabled="!sample || state === 'loading' || state === 'running'" @click="runSample">{{ t('runSample') }}</button>
      <button :disabled="state === 'loading' || state === 'running'" @click="picker.click()">{{ t('runMine') }}</button>
      <input ref="picker" type="file" hidden accept=".csv,.xls,.xlsx,.txt,.json,.xml,.html,.eml,.pdf" @change="runFile">
    </div>
    <p class="muted run-privacy">{{ t('runPrivacy') }}</p>

    <p v-if="state === 'loading'" role="status" class="muted">{{ t('runLoading') }}</p>
    <p v-else-if="state === 'running'" role="status" class="muted">{{ t('runRunning') }}</p>
    <div v-else-if="state === 'error'" class="notice failure" role="alert"><strong>{{ t('runFailed') }}</strong><pre class="run-error">{{ error }}</pre></div>

    <template v-else-if="state === 'done' && result">
      <div class="run-stats">
        <div><strong>{{ result.transactions }}</strong><span>{{ t('runTxns') }}</span></div>
        <div :class="{ warn: result.fixme > 0 }"><strong>{{ result.fixme }}</strong><span>{{ t('runFixme') }}</span></div>
        <div><strong>{{ fixmeLines }}</strong><span>{{ t('runFixmeLines') }}</span></div>
        <div class="run-source"><small class="muted">{{ source }}</small></div>
      </div>
      <p v-if="result.fixme > 0" class="muted">{{ t('runFixmeHint') }}</p>
      <ul v-if="result.warnings && result.warnings.length" class="run-warnings">
        <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
      </ul>
      <div class="run-out-head"><h3>{{ t('runOutput') }}</h3><button @click="copyOut">{{ t('copy') }}</button></div>
      <CodeBlock :text="result.beancount" max-height="520px" />
    </template>
  </section>
</template>
