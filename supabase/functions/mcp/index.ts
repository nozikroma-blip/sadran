// MCP-сервер Sadran: даёт Claude и ChatGPT возможность заводить и менять
// задачи голосом. Разворачивается как функция Supabase:
//
//   supabase functions deploy mcp --no-verify-jwt
//
// Проверку входа делаем сами (см. resolveUser), поэтому --no-verify-jwt:
// иначе Supabase отклонит запрос раньше, чем мы успеем вернуть коннектору
// понятную ошибку авторизации.
//
// Удаления здесь нет намеренно: ИИ может неверно понять просьбу,
// а восстановления у задач не предусмотрено.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOAuth } from './oauth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

/* ---------- Кто спрашивает ---------- */

// Клиент создаётся с токеном пользователя, поэтому правила доступа в базе
// работают сами: через ИИ человек увидит ровно то же, что и в приложении.
function clientFor(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

async function resolveUser(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const sb = clientFor(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await sb
    .from('profiles').select('*').eq('id', data.user.id).maybeSingle();

  return profile ? { sb, profile } : null;
}

/* ---------- Инструменты ---------- */

const TOOLS = [
  {
    name: 'list_projects',
    description:
      'Список проектов, доступных пользователю, с их номерами и названиями. ' +
      'Вызывай перед созданием задачи, чтобы выбрать правильный проект.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_people',
    description:
      'Список сотрудников команды, на которых можно назначить задачу. ' +
      'Вызывай, когда в просьбе назван исполнитель.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_tasks',
    description:
      'Задачи пользователя. По умолчанию — назначенные на него и незакрытые. ' +
      'Отвечай на вопросы вида «что у меня на этой неделе».',
    inputSchema: {
      type: 'object',
      properties: {
        mine_only: { type: 'boolean', description: 'Только мои задачи; по умолчанию true' },
        include_done: { type: 'boolean', description: 'Включать выполненные; по умолчанию false' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'create_task',
    description:
      'Создать задачу. Обязательны название и проект. Дедлайн — в формате ГГГГ-ММ-ДД, ' +
      'не раньше сегодняшнего дня и не позже 2099-12-31. ' +
      'После создания всегда покажи пользователю, что именно получилось.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        project_id: { type: 'string', description: 'id из list_projects' },
        assignee_id: { type: 'string', description: 'id из list_people; пусто — не назначено' },
        due: { type: 'string', description: 'ГГГГ-ММ-ДД' },
        notes: { type: 'string' }
      },
      required: ['title', 'project_id'],
      additionalProperties: false
    }
  },
  {
    name: 'update_task',
    description:
      'Изменить статус, срок или исполнителя существующей задачи. Удалять задачи нельзя.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['todo', 'progress', 'stuck', 'done'] },
        due: { type: 'string', description: 'ГГГГ-ММ-ДД' },
        assignee_id: { type: 'string' }
      },
      required: ['task_id'],
      additionalProperties: false
    }
  }
];

const projectLabel = (p: any) => (p.code ? `${p.code} ${p.name}` : p.name);
const personLabel = (p: any) => p.full_name || p.email;

async function runTool(name: string, args: any, ctx: any) {
  const { sb, profile } = ctx;

  if (name === 'list_projects') {
    const { data, error } = await sb.from('projects').select('id, code, name').order('created_at');
    if (error) throw error;
    return data.map((p: any) => ({ id: p.id, project: projectLabel(p) }));
  }

  if (name === 'list_people') {
    const { data, error } = await sb.from('profiles').select('id, full_name, email');
    if (error) throw error;
    return data.map((p: any) => ({ id: p.id, name: personLabel(p) }));
  }

  if (name === 'list_tasks') {
    let query = sb.from('tasks').select('id, title, status, due, assignee_id, project_id');
    if (args.mine_only !== false) query = query.eq('assignee_id', profile.id);
    if (!args.include_done) query = query.neq('status', 'done');

    const { data, error } = await query.order('due', { nullsFirst: false });
    if (error) throw error;
    return data;
  }

  if (name === 'create_task') {
    const row = {
      title: args.title,
      project_id: args.project_id,
      assignee_id: args.assignee_id || null,
      due: args.due || null,
      notes: args.notes || '',
      status: 'todo',
      created_by: profile.id
    };
    const { data, error } = await sb.from('tasks').insert(row).select().single();
    if (error) throw error;
    return { created: data };
  }

  if (name === 'update_task') {
    const patch: Record<string, unknown> = {};
    if (args.status) patch.status = args.status;
    if (args.due !== undefined) patch.due = args.due || null;
    if (args.assignee_id !== undefined) patch.assignee_id = args.assignee_id || null;

    const { data, error } = await sb
      .from('tasks').update(patch).eq('id', args.task_id).select().single();
    if (error) throw error;
    return { updated: data };
  }

  throw new Error(`Неизвестный инструмент: ${name}`);
}

/* ---------- Протокол ---------- */

const reply = (id: unknown, result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

const fail = (id: unknown, code: number, message: string, status = 200) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Служебные адреса входа обслуживает мост OAuth; сюда доходит только MCP.
  const oauth = await handleOAuth(request, new URL(request.url).pathname);
  if (oauth) return oauth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail(null, -32700, 'Некорректный JSON');
  }

  const { id, method, params } = body;

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'sadran', version: '3.2.0' }
    });
  }

  // Уведомления ответа не требуют.
  if (typeof method === 'string' && method.startsWith('notifications/')) {
    return new Response(null, { status: 202, headers: CORS });
  }

  if (method === 'tools/list') return reply(id, { tools: TOOLS });

  if (method === 'tools/call') {
    const ctx = await resolveUser(request);
    if (!ctx) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32001, message: 'Нужно войти в Sadran' }
        }),
        {
          status: 401,
          headers: {
            ...CORS,
            'Content-Type': 'application/json',
            'WWW-Authenticate': `Bearer resource_metadata="${SUPABASE_URL}/functions/v1/mcp/.well-known/oauth-protected-resource"`
          }
        }
      );
    }

    try {
      const result = await runTool(params.name, params.arguments ?? {}, ctx);
      return reply(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      });
    } catch (error) {
      return reply(id, {
        content: [{ type: 'text', text: `Ошибка: ${(error as Error).message}` }],
        isError: true
      });
    }
  }

  return fail(id, -32601, `Метод не поддерживается: ${method}`);
});
