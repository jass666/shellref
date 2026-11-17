/* shellref command-library API
 *
 * Bind a Cloudflare D1 database as DB and set ADMIN_EMAIL to the email that
 * should be allowed to write. The public site can read commands; only the
 * configured admin can create, update, or delete them.
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function adminEmail(request) {
  return request.headers.get('oai-authenticated-user-email') || request.headers.get('x-admin-email') || '';
}

function isAdmin(request, env) {
  return !!env.ADMIN_EMAIL && adminEmail(request).toLowerCase() === String(env.ADMIN_EMAIL).toLowerCase();
}

function normalize(raw) {
  if (!raw || !String(raw.command || '').trim()) return null;
  return {
    uid: Number(raw.uid) || Date.now(),
    title: String(raw.title || '').trim().slice(0, 120) || String(raw.command).split('\n')[0].slice(0, 120),
    command: String(raw.command).trim().slice(0, 12000),
    description: String(raw.description ?? raw.desc ?? '').trim().slice(0, 600),
    shell: ['cmd', 'powershell', 'unix'].includes(raw.shell) ? raw.shell : '',
    group_name: String(raw.group_name ?? raw.group ?? 'Saved from web').trim().slice(0, 60) || 'Saved from web',
    source_url: String(raw.source_url ?? raw.src ?? '').trim().slice(0, 500),
    updated_at: Date.now(),
  };
}

async function listCommands(env) {
  const { results } = await env.DB.prepare('SELECT uid, title, command, description AS desc, shell, group_name AS group, source_url AS src, updated_at AS ts FROM commands ORDER BY updated_at DESC').all();
  return results || [];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/commands') return json({ error: 'Not found' }, 404);

    if (request.method === 'GET') return json({ commands: await listCommands(env) });
    if (!isAdmin(request, env)) return json({ error: 'Admin access required.' }, 403);

    if (request.method === 'POST' || request.method === 'PUT') {
      const item = normalize(await request.json().catch(() => null));
      if (!item) return json({ error: 'A command is required.' }, 400);
      await env.DB.prepare(`INSERT INTO commands (uid, title, command, description, shell, group_name, source_url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET title=excluded.title, command=excluded.command, description=excluded.description,
        shell=excluded.shell, group_name=excluded.group_name, source_url=excluded.source_url, updated_at=excluded.updated_at`)
        .bind(item.uid, item.title, item.command, item.description, item.shell, item.group_name, item.source_url, item.updated_at).run();
      return json({ ok: true, command: item });
    }

    if (request.method === 'DELETE') {
      const uid = Number(url.searchParams.get('uid'));
      if (!uid) return json({ error: 'A command uid is required.' }, 400);
      await env.DB.prepare('DELETE FROM commands WHERE uid = ?').bind(uid).run();
      return json({ ok: true, uid });
    }

    return json({ error: 'Method not allowed' }, 405);
  },
};
