#!/usr/bin/env node
/**
 * LM Studio alignment check: connectivity, list/load/unload API shape, and recommended app settings.
 * Run: node scripts/check-lmstudio.mjs
 * Env: LM_STUDIO_BASE_URL (default http://localhost:1234), LM_API_TOKEN (optional, if Require Authentication is on).
 */

const BASE = (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '');
const TOKEN = process.env.LM_API_TOKEN || '';

const headers = { 'Content-Type': 'application/json' };
if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {}
  return { ok: res.ok, status: res.status, data, text };
}

async function main() {
  console.log('LM Studio alignment check');
  console.log('Base URL:', BASE);
  console.log('Auth:   ', TOKEN ? 'Bearer (from LM_API_TOKEN)' : 'none');
  console.log('');

  const checks = [];
  let listData = null;
  let loadedCount = 0;
  let modelCount = 0;

  // 1) GET /api/v1/models
  const listRes = await fetchJson(`${BASE}/api/v1/models`);
  if (listRes.ok && listRes.data) {
    const raw = listRes.data.models ?? listRes.data.data?.models ?? (Array.isArray(listRes.data) ? listRes.data : []);
    const models = Array.isArray(raw) ? raw : [];
    modelCount = models.length;
    for (const m of models) {
      const instances = m?.loaded_instances ?? m?.instances ?? [];
      if (Array.isArray(instances)) loadedCount += instances.length;
    }
    listData = listRes.data;
    checks.push({ name: 'GET /api/v1/models', ok: true, detail: `${modelCount} models, ${loadedCount} loaded instance(s)` });
  } else {
    if (listRes.status === 401) {
      checks.push({
        name: 'GET /api/v1/models',
        ok: false,
        detail: '401 Unauthorized. LM Studio has "Require Authentication" enabled. Set LM_API_TOKEN in env, or disable auth in LM Studio → Developer → Server Settings.',
      });
    } else {
      checks.push({
        name: 'GET /api/v1/models',
        ok: false,
        detail: `HTTP ${listRes.status}. Is the server running at ${BASE}? Start LM Studio and turn on the server in the Developer tab.`,
      });
    }
  }

  // 2) Optional: try OpenAI-compat list (fallback used by app)
  if (listRes.ok) {
    const openaiRes = await fetchJson(`${BASE}/v1/models`);
    checks.push({
      name: 'GET /v1/models (OpenAI-compat)',
      ok: openaiRes.ok,
      detail: openaiRes.ok ? 'OK (app fallback for model list)' : `HTTP ${openaiRes.status}`,
    });
  }

  // 3) If we have loaded instances, optionally test unload (dry run: we only report; we don't unload by default to avoid disrupting user)
  if (listRes.ok && loadedCount > 0 && listData) {
    const raw = listData.models ?? listData.data?.models ?? (Array.isArray(listData) ? listData : []);
    const instanceIds = [];
    for (const m of raw) {
      const instances = m?.loaded_instances ?? m?.instances ?? [];
      if (Array.isArray(instances)) for (const inst of instances) if (inst?.id != null) instanceIds.push(String(inst.id));
    }
    checks.push({
      name: 'Unload API (shape)',
      ok: true,
      detail: `${instanceIds.length} instance_id(s) collected. App uses POST /api/v1/models/unload with each.`,
    });
  }

  // Print results
  console.log('--- API checks ---');
  for (const c of checks) {
    console.log(c.ok ? '  ✓' : '  ✗', c.name + ':', c.detail);
  }
  console.log('');
  console.log('--- LM Studio app settings (optimize in LM Studio, not in this script) ---');
  console.log('  1. Server: Running on port 1234 (or your base URL).');
  console.log('  2. CORS:   Enabled (Developer tab) so the browser can call LM Studio.');
  console.log('  3. Auto-Evict: ON (Server Settings) so JIT-loaded models are evicted when loading another.');
  console.log('  4. JIT loading: ON so the first chat can load the model if not loaded.');
  console.log('  5. Idle TTL: Default 60 min; optional per-request ttl is supported by this app in Settings.');
  console.log('  6. Require Authentication: OFF unless you add an API token to this app (future).');
  console.log('');
  console.log('See docs/LM_STUDIO_ALIGNMENT.md and docs/LM_STUDIO_DEVELOPER_REFERENCE.md for details.');
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
