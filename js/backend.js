/* Optional shared command-library bridge.
 * The static site stays usable without an API: every operation falls back to
 * the existing browser storage. When /api/commands is deployed, this bridge
 * hydrates the library and mirrors admin edits to the shared backend.
 */
const shellrefBackend = (() => {
  const endpoint = '/api/commands';
  let available = false;

  async function request(url, options) {
    try {
      const res = await fetch(url, Object.assign({ headers: { 'content-type': 'application/json' } }, options || {}));
      if (!res.ok) return null;
      available = true;
      return await res.json();
    } catch (e) { return null; }
  }

  async function hydrate() {
    const data = await request(endpoint);
    if (!data || !Array.isArray(data.commands) || typeof mineLocal === 'undefined') return;
    data.commands.forEach(raw => {
      const e = mineNormalize(raw);
      if (!e) return;
      const i = mineLocal.findIndex(x => Number(x.uid) === Number(e.uid));
      if (i === -1) mineLocal.push(e); else mineLocal[i] = e;
    });
    libSaveAll();
    if (typeof render === 'function') render();
  }

  function save(entry) { return request(endpoint, { method: 'PUT', body: JSON.stringify(entry) }); }
  function remove(uid) { return request(endpoint + '?uid=' + encodeURIComponent(uid), { method: 'DELETE' }); }
  function isAvailable() { return available; }
  return { hydrate, save, remove, isAvailable };
})();
