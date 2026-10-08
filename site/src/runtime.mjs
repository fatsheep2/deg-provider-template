// Lazy loader for the Go importer compiled to WebAssembly. Loaded once per
// page, on first use, because the binary is large and most visitors only
// read. Everything runs in the page; no statement is uploaded anywhere.

let ready = null;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error('wasmExecLoad'));
    document.head.appendChild(s);
  });
}

/** @returns {Promise<{import: (template:string, rules:string, name:string, bytes:Uint8Array) => object}>} */
export function loadRuntime(assetUrl) {
  if (ready) return ready;
  ready = (async () => {
    if (typeof globalThis.Go !== 'function') await loadScript(assetUrl('wasm_exec.js'));
    const go = new globalThis.Go();
    const url = assetUrl('deg-runtime.wasm');
    let instance;
    try {
      ({ instance } = await WebAssembly.instantiateStreaming(fetch(url), go.importObject));
    } catch {
      // Servers that mislabel .wasm fall back to a plain buffer.
      const res = await fetch(url);
      if (!res.ok) throw new Error('wasmLoad');
      ({ instance } = await WebAssembly.instantiate(await res.arrayBuffer(), go.importObject));
    }
    go.run(instance); // resolves only when the program exits; it never does
    const api = globalThis.degRuntimeImport;
    if (typeof api !== 'function') throw new Error('wasmInit');
    return { import: (template, rules, name, bytes) => api(template, rules, name, bytes) };
  })();
  ready.catch(() => { ready = null; });
  return ready;
}
