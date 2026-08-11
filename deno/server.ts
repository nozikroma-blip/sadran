// MCP-сервер Sadran для Deno Deploy.
//
// Почему не Supabase: Claude ищет служебные адреса OAuth в корне домена
// (/authorize, /token, /register). Корень supabase.co нам не принадлежит,
// поэтому сервер живёт здесь, а данные остаются в Supabase.
//
// Вход — по одноразовому коду привязки, который выдаёт само приложение.
// Пароли через этот хостинг не проходят: их тут просто не спрашивают.
//
// Развёртывание:
//   deployctl deploy --project=sadran-mcp --prod deno/server.ts
// Переменные окружения проекта: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY);

const userClient = (token: string) =>
  createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra }
  });

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const escape = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// PKCE: код авторизации бесполезен без секрета, который коннектор нам не показывал.
async function pkceMatches(verifier: string, challenge: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === challenge;
}

/* ---------- Инструменты ---------- */

const TOOLS = [
  { name: 'list_projects', description: 'Проекты пользователя с номерами и названиями. Вызывай перед созданием задачи.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_people', description: 'Сотрудники команды, на которых можно назначить задачу.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_tasks', description: 'Задачи пользователя. По умолчанию — его собственные и незакрытые.',
    inputSchema: { type: 'object', properties: {
      mine_only: { type: 'boolean' }, include_done: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'create_task', description: 'Создать задачу. Дедлайн ГГГГ-ММ-ДД, не раньше сегодня и не позже 2099-12-31. После создания покажи пользователю результат.',
    inputSchema: { type: 'object', properties: {
      title: { type: 'string' }, project_id: { type: 'string' }, assignee_id: { type: 'string' },
      due: { type: 'string' }, notes: { type: 'string' } },
      required: ['title', 'project_id'], additionalProperties: false } },
  { name: 'update_task', description: 'Изменить статус, срок или исполнителя. Удалять задачи нельзя.',
    inputSchema: { type: 'object', properties: {
      task_id: { type: 'string' }, status: { type: 'string', enum: ['todo', 'progress', 'stuck', 'done'] },
      due: { type: 'string' }, assignee_id: { type: 'string' } },
      required: ['task_id'], additionalProperties: false } }
];

const projectLabel = (p: any) => (p.code ? `${p.code} ${p.name}` : p.name);

async function runTool(name: string, args: any, sb: any, me: any) {
  if (name === 'list_projects') {
    const { data, error } = await sb.from('projects').select('id, code, name').order('created_at');
    if (error) throw error;
    return data.map((p: any) => ({ id: p.id, project: projectLabel(p) }));
  }
  if (name === 'list_people') {
    const { data, error } = await sb.from('profiles').select('id, full_name, email');
    if (error) throw error;
    return data.map((p: any) => ({ id: p.id, name: p.full_name || p.email }));
  }
  if (name === 'list_tasks') {
    let q = sb.from('tasks').select('id, title, status, due, assignee_id, project_id');
    if (args.mine_only !== false) q = q.eq('assignee_id', me.id);
    if (!args.include_done) q = q.neq('status', 'done');
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  if (name === 'create_task') {
    const { data, error } = await sb.from('tasks').insert({
      title: args.title, project_id: args.project_id,
      assignee_id: args.assignee_id || null, due: args.due || null,
      notes: args.notes || '', status: 'todo', created_by: me.id
    }).select().single();
    if (error) throw error;
    return { created: data };
  }
  if (name === 'update_task') {
    const patch: Record<string, unknown> = {};
    if (args.status) patch.status = args.status;
    if (args.due !== undefined) patch.due = args.due || null;
    if (args.assignee_id !== undefined) patch.assignee_id = args.assignee_id || null;
    const { data, error } = await sb.from('tasks').update(patch).eq('id', args.task_id).select().single();
    if (error) throw error;
    return { updated: data };
  }
  throw new Error(`Неизвестный инструмент: ${name}`);
}

/* ---------- Страница привязки ---------- */

function pairingPage(q: URLSearchParams, error = '') {
  const hidden = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method']
    .map((k) => `<input type="hidden" name="${k}" value="${escape(q.get(k) ?? '')}" />`).join('');

  return html(`<!doctype html><html lang="ru"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Sadran</title>
<style>
 body{font:15px/1.5 system-ui,sans-serif;background:#eef0f2;color:#111823;display:grid;
      place-items:center;min-height:100vh;margin:0;padding:20px}
 form{background:#fff;padding:28px;border-radius:12px;width:min(380px,100%);
      box-shadow:0 10px 34px rgb(20 25 60/.12)}
 h1{margin:0 0 6px;font-size:20px} p{margin:0 0 18px;color:#5a6472;font-size:13.5px}
 input[name=code]{display:block;width:100%;margin-bottom:16px;padding:11px;font:inherit;
      font-size:22px;letter-spacing:.35em;text-align:center;border:1px solid #d6dae0;
      border-radius:7px;box-sizing:border-box}
 button{width:100%;padding:10px;font:inherit;border:0;border-radius:7px;background:#0073ea;color:#fff;cursor:pointer}
 .err{background:#fdecef;color:#a11c33;padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:13px}
</style></head><body><form method="post">
 <h1>Подключение помощника</h1>
 <p>Откройте Sadran, нажмите «Подключить помощника» внизу слева и введите показанный код. Пароль вводить не нужно.</p>
 ${error ? `<div class="err">${escape(error)}</div>` : ''}${hidden}
 <input name="code" inputmode="numeric" autocomplete="off" maxlength="6" required autofocus placeholder="000000" />
 <button type="submit">Подключить</button>
</form></body></html>`);
}

/* ---------- Маршруты ---------- */

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const origin = url.origin;

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    } });
  }

  if (path === '/.well-known/oauth-protected-resource') {
    return json({ resource: origin, authorization_servers: [origin] });
  }

  if (path === '/.well-known/oauth-authorization-server') {
    return json({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none']
    });
  }

  if (path === '/register' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const uris: string[] = body.redirect_uris ?? [];
    if (!uris.length) return json({ error: 'invalid_redirect_uri' }, 400);

    const { data, error } = await admin().from('oauth_clients')
      .insert({ name: body.client_name ?? '', redirect_uris: uris }).select().single();
    if (error) return json({ error: 'server_error' }, 500);

    return json({ client_id: data.id, client_name: data.name, redirect_uris: data.redirect_uris,
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'] }, 201);
  }

  if (path === '/authorize') {
    const q = request.method === 'POST'
      ? new URLSearchParams(await request.text()) : url.searchParams;

    const challenge = q.get('code_challenge') ?? '';
    if (q.get('code_challenge_method') !== 'S256' || !challenge) {
      return html('<p>Коннектор должен использовать PKCE (S256).</p>', 400);
    }

    const { data: client } = await admin().from('oauth_clients')
      .select('*').eq('id', q.get('client_id') ?? '').maybeSingle();

    const redirectUri = q.get('redirect_uri') ?? '';
    if (!client || !client.redirect_uris.includes(redirectUri)) {
      return html('<p>Неизвестный коннектор или неразрешённый адрес возврата.</p>', 400);
    }

    if (request.method === 'GET') return pairingPage(q);

    // Код привязки создало само приложение от имени вошедшего человека.
    const db = admin();
    await db.rpc('purge_pairing_codes');

    const { data: pairing } = await db.from('pairing_codes')
      .select('*').eq('code', (q.get('code') ?? '').trim()).maybeSingle();

    if (!pairing || pairing.used || new Date(pairing.expires_at) < new Date()) {
      return pairingPage(q, 'Код неверный или устарел. Возьмите новый в приложении.');
    }
    await db.from('pairing_codes').update({ used: true }).eq('code', pairing.code);

    const authCode = crypto.randomUUID() + crypto.randomUUID();
    await db.from('oauth_codes').insert({
      code: authCode, client_id: client.id, redirect_uri: redirectUri,
      code_challenge: challenge, session: pairing.session
    });

    const back = new URL(redirectUri);
    back.searchParams.set('code', authCode);
    const state = q.get('state');
    if (state) back.searchParams.set('state', state);
    return new Response(null, { status: 302, headers: { Location: back.toString() } });
  }

  if (path === '/token' && request.method === 'POST') {
    const form = new URLSearchParams(await request.text());
    const db = admin();
    await db.rpc('purge_oauth_codes');

    if (form.get('grant_type') === 'refresh_token') {
      const { data, error } = await createClient(SUPABASE_URL, ANON_KEY)
        .auth.refreshSession({ refresh_token: form.get('refresh_token') ?? '' });
      if (error || !data.session) return json({ error: 'invalid_grant' }, 400);
      return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token,
        token_type: 'Bearer', expires_in: data.session.expires_in });
    }

    if (form.get('grant_type') !== 'authorization_code') {
      return json({ error: 'unsupported_grant_type' }, 400);
    }

    const { data: row } = await db.from('oauth_codes')
      .select('*').eq('code', form.get('code') ?? '').maybeSingle();

    const valid = row && !row.used && new Date(row.expires_at) > new Date()
      && row.client_id === form.get('client_id')
      && row.redirect_uri === form.get('redirect_uri')
      && await pkceMatches(form.get('code_verifier') ?? '', row.code_challenge);

    if (!valid) return json({ error: 'invalid_grant' }, 400);
    await db.from('oauth_codes').update({ used: true }).eq('code', row.code);

    return json({ access_token: row.session.access_token, refresh_token: row.session.refresh_token,
      token_type: 'Bearer', expires_in: row.session.expires_in });
  }

  /* ---------- MCP ---------- */

  const body = await request.json().catch(() => null);
  if (!body) return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Некорректный JSON' } });

  const { id, method, params } = body;

  if (method === 'initialize') {
    return json({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2025-06-18', capabilities: { tools: {} },
      serverInfo: { name: 'sadran', version: '3.3.0' } } });
  }

  if (typeof method === 'string' && method.startsWith('notifications/')) {
    return new Response(null, { status: 202, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  if (method === 'tools/list') return json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });

  if (method === 'tools/call') {
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const sb = token ? userClient(token) : null;
    const user = sb ? (await sb.auth.getUser(token)).data.user : null;

    if (!user) {
      return json({ jsonrpc: '2.0', id, error: { code: -32001, message: 'Нужно подключить Sadran' } }, 401,
        { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` });
    }

    try {
      const result = await runTool(params.name, params.arguments ?? {}, sb, user);
      return json({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
    } catch (error) {
      return json({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `Ошибка: ${(error as Error).message}` }], isError: true } });
    }
  }

  return json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Метод не поддерживается: ${method}` } });
});
