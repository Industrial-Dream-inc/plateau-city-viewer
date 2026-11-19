// Small client for the BunCho city 3D generation API.
// Docs: https://bun-cho.work/docs/agents/city.md
//
// Run it on a server or in a CLI. Do NOT ship an API key to a browser:
// anyone who opens the page can read it and spend your DREAM.

const DEFAULT_BASE = 'https://bun-cho.work/studio/api/v1';

export class BunChoCity {
  /**
   * @param {object} [opts]
   * @param {string} [opts.apiKey]   bk_live_... (defaults to process.env.BUNCHO_API_KEY)
   * @param {string} [opts.baseUrl]
   * @param {typeof fetch} [opts.fetch]
   */
  constructor(opts = {}) {
    const env = typeof process !== 'undefined' ? process.env : {};
    this.apiKey = opts.apiKey ?? env.BUNCHO_API_KEY;
    this.baseUrl = (opts.baseUrl ?? env.BUNCHO_API_BASE ?? DEFAULT_BASE).replace(/\/$/, '');
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async #req(method, path, body, { auth = true, idempotencyKey } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      if (!this.apiKey) throw new Error('BUNCHO_API_KEY is not set. Create a key at https://bun-cho.work/studio/developers');
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await this.fetch(this.baseUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`BunCho API ${res.status}: ${json?.error?.message || json?.error || text.slice(0, 200)}`);
      err.status = res.status; err.body = json;
      throw err;
    }
    return json;
  }

  /** Districts you can generate (free, no key needed). */
  listLocations() { return this.#req('GET', '/geometry/locations', null, { auth: false }); }

  /** Public price table (free, no key needed). */
  pricing() { return this.#req('GET', '/pricing', null, { auth: false }); }

  /** DREAM balance of the key's account (free). */
  balance() { return this.#req('GET', '/balance'); }

  /**
   * Price check for a district crop (free): same body as generate, with dry_run.
   * @param {{district?: string, lat?: number, lon?: number, width_m: number, depth_m: number}} area
   */
  estimate(area) { return this.#req('POST', '/geometry/locations', { ...area, dry_run: true }); }

  /**
   * Generate a high-detail city crop. COSTS DREAM (300 per 400 x 300 m block).
   * Pass { confirm: true } to make sure this is never called by accident.
   */
  generate(area, { confirm = false, idempotencyKey } = {}) {
    if (!confirm) throw new Error('generate() spends DREAM. Call estimate() first, then pass { confirm: true }.');
    return this.#req('POST', '/geometry/locations', area, { idempotencyKey: idempotencyKey ?? `pcv-${Date.now()}` });
  }

  /** Poll a job (free). */
  job(id) { return this.#req('GET', `/jobs/${encodeURIComponent(id)}`); }

  /**
   * Download a result file. The API answers with a redirect to a signed URL;
   * follow it WITHOUT forwarding the key.
   */
  async download(url) {
    const first = await this.fetch(url, { headers: { Authorization: `Bearer ${this.apiKey}` }, redirect: 'manual' });
    const loc = first.headers.get('location');
    const res = loc ? await this.fetch(loc) : first;
    if (!res.ok) throw new Error(`download ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
