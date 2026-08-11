// Мост OAuth 2.1 между Claude/ChatGPT и Supabase Auth.
//
// Supabase Auth умеет проверять токены, но провайдером OAuth для сторонних
// приложений не является. Этот модуль закрывает разрыв: коннектор
// регистрируется сам, человек вводит почту и пароль от Sadran на нашей
// странице, а наружу отдаётся обычный токен Supabase — тот же, с которым
// работает приложение, поэтому права в базе действуют без изменений.
//
// Пароль виден только этой странице и уходит прямо в Supabase Auth:
// ни Claude, ни ChatGPT его не получают.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BASE = `${SUPABASE_URL}/functions/v1/mcp`;

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/* ---------- PKCE ---------- */

// Проверяем S256: код авторизации бесполезен без секрета, который
// коннектор придумал у себя и нам не показывал.
async function pkceMatches(verifier: string, challenge: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return encoded === challenge;
}

/* ---------- Страница входа ---------- */

function loginPage(query: URLSearchParams, error = '') {
  const hidden = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method']
    .map((k) => `<input type="hidden" name="${k}" value="${escape(query.get(k) ?? '')}" />`)
    .join('');

  return html(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Вход в Sadran</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; background: #eef0f2; color: #111823;
         display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 20px; }
  form { background: #fff; padding: 28px; border-radius: 12px; width: min(380px, 100%);
         box-shadow: 0 10px 34px rgb(20 25 60 / .12); }
  h1 { margin: 0 0 6px; font-size: 20px; }
  p { margin: 0 0 18px; color: #5a6472; font-size: 13.5px; }
  label { display: block; margin-bottom: 14px; font-size: 12.5px; color: #5a6472; }
  input { display: block; width: 100%; margin-top: 5px; padding: 9px 11px; font: inherit;
          border: 1px solid #d6dae0; border-radius: 7px; box-sizing: border-box; }
  button { width: 100%; padding: 10px; font: inherit; border: 0; border-radius: 7px;
           background: #0073ea; color: #fff; cursor: pointer; }
  .err { background: #fdecef; color: #a11c33; padding: 10px 12px;
         border-radius: 8px; margin-bottom: 14px; font-size: 13px; }
</style></head><body>
<form method="post">
  <h1>Sadran</h1>
  <p>Разрешить помощнику работать с вашими задачами? Войдите тем же логином, что и в приложении.</p>
  ${error ? `<div class="err">${escape(error)}</div>` : ''}
  ${hidden}
  <label>Почта<input name="email" type="email" required autocomplete="username" /></label>
  <label>Пароль<input name="password" type="password" required autocomplete="current-password" /></label>
  <button type="submit">Разрешить доступ</button>
</form></body></html>`);
}

/* ---------- Маршруты ---------- */

export async function handleOAuth(request: Request, path: string): Promise<Response | null> {
  // Какой сервер авторизации обслуживает этот ресурс.
  if (path.endsWith('/.well-known/oauth-protected-resource')) {
    return json({ resource: BASE, authorization_servers: [BASE] });
  }

  if (path.endsWith('/.well-known/oauth-authorization-server')) {
    return json({
      issuer: BASE,
      authorization_endpoint: `${BASE}/authorize`,
      token_endpoint: `${BASE}/token`,
      registration_endpoint: `${BASE}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none']
    });
  }

  // Коннектор регистрируется сам и получает client_id.
  if (path.endsWith('/register') && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const uris: string[] = body.redirect_uris ?? [];
    if (uris.length === 0) return json({ error: 'invalid_redirect_uri' }, 400);

    const { data, error } = await admin()
      .from('oauth_clients')
      .insert({ name: body.client_name ?? '', redirect_uris: uris })
      .select().single();
    if (error) return json({ error: 'server_error' }, 500);

    return json({
      client_id: data.id,
      client_name: data.name,
      redirect_uris: data.redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    }, 201);
  }

  if (path.endsWith('/authorize')) {
    const url = new URL(request.url);
    const query = request.method === 'POST'
      ? new URLSearchParams(await request.text())
      : url.searchParams;

    const clientId = query.get('client_id') ?? '';
    const redirectUri = query.get('redirect_uri') ?? '';
    const challenge = query.get('code_challenge') ?? '';

    if (query.get('code_challenge_method') !== 'S256' || !challenge) {
      return html('<p>Коннектор должен использовать PKCE с методом S256.</p>', 400);
    }

    // Адрес возврата принимаем только тот, что клиент заявил при регистрации:
    // иначе код авторизации можно было бы увести на чужой адрес.
    const { data: client } = await admin()
      .from('oauth_clients').select('*').eq('id', clientId).maybeSingle();

    if (!client || !client.redirect_uris.includes(redirectUri)) {
      return html('<p>Неизвестный коннектор или неразрешённый адрес возврата.</p>', 400);
    }

    if (request.method === 'GET') return loginPage(query);

    const { data: auth, error } = await createClient(SUPABASE_URL, ANON_KEY)
      .auth.signInWithPassword({
        email: (query.get('email') ?? '').trim(),
        password: query.get('password') ?? ''
      });

    if (error || !auth.session) return loginPage(query, 'Неверная почта или пароль.');

    const code = crypto.randomUUID() + crypto.randomUUID();
    await admin().from('oauth_codes').insert({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      session: {
        access_token: auth.session.access_token,
        refresh_token: auth.session.refresh_token,
        expires_in: auth.session.expires_in
      }
    });

    const back = new URL(redirectUri);
    back.searchParams.set('code', code);
    const state = query.get('state');
    if (state) back.searchParams.set('state', state);

    return new Response(null, { status: 302, headers: { Location: back.toString() } });
  }

  if (path.endsWith('/token') && request.method === 'POST') {
    const form = new URLSearchParams(await request.text());
    const db = admin();
    await db.rpc('purge_oauth_codes');

    // Продление доступа: коннектор сам обновляет истёкший токен.
    if (form.get('grant_type') === 'refresh_token') {
      const { data, error } = await createClient(SUPABASE_URL, ANON_KEY)
        .auth.refreshSession({ refresh_token: form.get('refresh_token') ?? '' });

      if (error || !data.session) return json({ error: 'invalid_grant' }, 400);
      return json({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        token_type: 'Bearer',
        expires_in: data.session.expires_in
      });
    }

    if (form.get('grant_type') !== 'authorization_code') {
      return json({ error: 'unsupported_grant_type' }, 400);
    }

    const { data: row } = await db
      .from('oauth_codes').select('*').eq('code', form.get('code') ?? '').maybeSingle();

    const valid = row
      && !row.used
      && new Date(row.expires_at) > new Date()
      && row.client_id === form.get('client_id')
      && row.redirect_uri === form.get('redirect_uri')
      && await pkceMatches(form.get('code_verifier') ?? '', row.code_challenge);

    if (!valid) return json({ error: 'invalid_grant' }, 400);

    // Код одноразовый: помечаем использованным до того, как отдать токен.
    await db.from('oauth_codes').update({ used: true }).eq('code', row.code);

    return json({
      access_token: row.session.access_token,
      refresh_token: row.session.refresh_token,
      token_type: 'Bearer',
      expires_in: row.session.expires_in
    });
  }

  return null;
}
