'use strict';

const STATUSES = [
  { id: 'todo',     cls: 'todo' },
  { id: 'progress', cls: 'progress' },
  { id: 'stuck',    cls: 'stuck' },
  { id: 'done',     cls: 'done' }
];

const MY_TASKS = '__my__';
const TEAM_VIEW = '__team__';

const statusById = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

// Названия статусов и ролей зависят от языка, поэтому берутся из словаря.
const statusLabel = (id) => t('status.' + statusById(id).id);
const roleLabel = (role) => t('role.' + role);

const $ = (id) => document.getElementById(id);

/* ---------- Состояние ---------- */

let sb = null;              // клиент Supabase
let me = null;              // профиль вошедшего пользователя
let profiles = [];          // видимые мне люди
let teams = [];             // видимые мне команды
let projects = [];
let tasks = [];             // задачи всех проектов сразу
let view = MY_TASKS;        // MY_TASKS или id проекта
let editingTaskId = null;
let authMode = 'signIn';
let channel = null;

// Владельцу видны все команды сразу — это мешает работать со своими проектами,
// поэтому он может временно смотреть на приложение глазами своей команды.
let viewAs = 'owner';

let comments = [];      // комментарии открытой задачи
let attachments = [];   // вложения открытой задачи
let recorder = null;    // запись голоса

let allComments = [];   // всё, что видно мне — для счётчиков в таблице
let allAttachments = [];
// id задачи -> что показываем под ней: 'comments' или 'files'.
const expanded = new Map();
const thumbs = new Map();     // path -> временная ссылка на картинку

const filters = { text: '', status: '', assignee: '', overdueOnly: false, hideDone: true };

/* ---------- Утилиты ---------- */

const PALETTE_SIZE = 12;

function colorIndex(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
  return h % PALETTE_SIZE;
}

// Цвет проекта не должен меняться от того, как участник разложил список у себя,
// поэтому берём стабильный порядок по дате создания: первые 12 проектов
// гарантированно разного цвета, а перетаскивание цвета не трогает.
function projectColor(id) {
  const ordered = [...projects].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const i = ordered.findIndex((p) => p.id === id);
  return (i < 0 ? colorIndex(id) : i) % PALETTE_SIZE;
}

// То же для людей — порядок берём стабильный, по дате регистрации.
function personColor(id) {
  const ordered = [...profiles].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const i = ordered.findIndex((p) => p.id === id);
  return (i < 0 ? colorIndex(id) : i) % PALETTE_SIZE;
}

function initials(name) {
  const parts = String(name).split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((w) => w[0].toUpperCase()).join('') || '?';
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Сегодняшняя дата в формате, который понимает <input type="date">.
function todayISO() {
  const d = todayStart();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Дней до дедлайна: <0 — просрочено, 0 — сегодня.
function daysUntil(due) {
  const d = new Date(due + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d - todayStart()) / 86400000);
}

function formatDue(due) {
  const d = new Date(due + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return due;
  return d.toLocaleDateString(langInfo().locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function dueHint(days) {
  if (days === 0) return t('due.today');
  if (days === 1) return t('due.tomorrow');
  if (days === -1) return t('due.yesterday');
  if (days < 0) return t('due.overdueBy', { days: -days });
  if (days <= 7) return t('due.inDays', { days });
  return '';
}

const isOverdue = (t) => t.status !== 'done' && t.due && daysUntil(t.due) < 0;

const profileById = (id) => profiles.find((p) => p.id === id) || null;
const projectById = (id) => projects.find((p) => p.id === id) || null;
const teamById = (id) => teams.find((t) => t.id === id) || null;

const isOwner = () => me && me.role === 'owner';
const isLeader = () => me && me.role === 'leader';

// Права остаются прежними; переключатель влияет только на то, что показано.
const seeingAll = () => isOwner() && viewAs === 'owner';

// Поиск в боковой панели: сверяем и номер, и название.
let projectFilter = '';

// Порядок проектов — личное дело каждого: человек раскладывает список под себя,
// на других это не влияет. Поэтому храним его на этом компьютере, отдельно
// для каждого аккаунта, а не в общей базе.
let projectOrder = [];       // id проектов в том порядке, как их разложили
let projectSort = 'manual';  // 'manual' — вручную, либо 'code' / 'name'

const orderKey = () => `sadran.projectOrder.${me ? me.id : 'anon'}`;

function loadProjectOrder() {
  projectOrder = [];
  projectSort = 'manual';
  try {
    const saved = JSON.parse(localStorage.getItem(orderKey()) || '{}');
    if (Array.isArray(saved.order)) {
      projectOrder = saved.order.filter((id) => typeof id === 'string');
    }
    if (saved.sort === 'code' || saved.sort === 'name') projectSort = saved.sort;
  } catch (error) {
    // Испорченную запись просто игнорируем — начнём с порядка по умолчанию.
  }
}

function saveProjectOrder() {
  try {
    localStorage.setItem(orderKey(), JSON.stringify({ order: projectOrder, sort: projectSort }));
  } catch (error) {
    // Если хранилище недоступно, порядок доживёт до перезапуска — и ладно.
  }
}

// Проекты без номера уходят в конец: сортировать их по пустой строке бессмысленно.
function byCode(a, b) {
  if (!a.code !== !b.code) return a.code ? -1 : 1;
  const locale = langInfo().locale;
  return String(a.code || '').localeCompare(String(b.code || ''), locale, { numeric: true })
    || byName(a, b);
}

const byName = (a, b) => a.name.localeCompare(b.name, langInfo().locale);

// Проекты, которых ещё нет в личном порядке (только что созданные кем-то),
// встают в конец — по дате создания.
function orderedProjects(list) {
  if (projectSort === 'code') return [...list].sort(byCode);
  if (projectSort === 'name') return [...list].sort(byName);

  const rank = new Map(projectOrder.map((id, i) => [id, i]));
  const at = (p) => (rank.has(p.id) ? rank.get(p.id) : Number.MAX_SAFE_INTEGER);
  return [...list].sort((a, b) => at(a) - at(b) || a.created_at.localeCompare(b.created_at));
}

const visibleProjects = () => {
  const scope = seeingAll() ? projects : projects.filter((p) => p.team_id === me.team_id);
  const found = !projectFilter
    ? scope
    : scope.filter((p) => projectLabel(p).toLowerCase().includes(projectFilter));
  return orderedProjects(found);
};

// Порядок задач внутри проекта — тоже личный и хранится так же. Для каждого
// проекта он свой: где-то удобно по сроку, где-то разложить руками.
let taskBoards = {};   // id проекта -> { sort: 'due' | 'manual', order: [id задач] }

const taskOrderKey = () => `sadran.taskOrder.${me ? me.id : 'anon'}`;

function loadTaskOrder() {
  taskBoards = {};
  try {
    const saved = JSON.parse(localStorage.getItem(taskOrderKey()) || '{}');
    for (const [projectId, board] of Object.entries(saved)) {
      if (!board || !Array.isArray(board.order)) continue;
      taskBoards[projectId] = {
        sort: board.sort === 'manual' ? 'manual' : 'due',
        order: board.order.filter((id) => typeof id === 'string')
      };
    }
  } catch (error) {
    // Испорченную запись игнорируем — вернёмся к сортировке по сроку.
  }
}

function saveTaskOrder() {
  try {
    localStorage.setItem(taskOrderKey(), JSON.stringify(taskBoards));
  } catch (error) {
    // Хранилище недоступно — порядок доживёт до перезапуска.
  }
}

const boardOf = (projectId) => taskBoards[projectId] || { sort: 'due', order: [] };

// Пока человек не трогал список руками, задачи разложены по сроку — как раньше.
function orderedTasks(list, projectId) {
  const board = boardOf(projectId);
  if (board.sort !== 'manual') return [...list].sort(byDueDate);

  const rank = new Map(board.order.map((id, i) => [id, i]));
  const at = (task) => (rank.has(task.id) ? rank.get(task.id) : Number.MAX_SAFE_INTEGER);
  return [...list].sort((a, b) => at(a) - at(b) || byDueDate(a, b));
}

function moveTask(projectId, dragId, targetId, after) {
  if (!dragId || !targetId || dragId === targetId) return;

  // Как и у проектов: держим порядок всех задач проекта, а не только видимых,
  // иначе задача перепрыгнет через скрытые фильтром строки.
  const all = orderedTasks(tasks.filter((x) => x.project_id === projectId), projectId);
  const full = all.map((x) => x.id);

  const from = full.indexOf(dragId);
  if (from < 0) return;
  full.splice(from, 1);

  const to = full.indexOf(targetId);
  if (to < 0) return;
  full.splice(after ? to + 1 : to, 0, dragId);

  taskBoards[projectId] = { sort: 'manual', order: full };
  saveTaskOrder();
  renderTasks();
}

// Личный порядок держим полным списком id — тогда проект не прыгает через
// половину списка, если он показан не весь (включён поиск или «только моя команда»).
function moveProject(dragId, targetId, after) {
  if (!dragId || !targetId || dragId === targetId) return;

  const full = orderedProjects(projects).map((p) => p.id);
  const from = full.indexOf(dragId);
  if (from < 0) return;
  full.splice(from, 1);

  const to = full.indexOf(targetId);
  if (to < 0) return;
  full.splice(after ? to + 1 : to, 0, dragId);

  projectOrder = full;
  projectSort = 'manual';   // перетащили — значит, дальше порядок ручной
  saveProjectOrder();
  renderSidebar();
}

// Завести проект в своей команде может любой её участник.
// Удаление осталось за владельцем и лидером — см. supabase-migration-3.1.sql.
const canManageProjects = () => Boolean(me && (isOwner() || me.team_id));
const canDeleteProjects = () => isOwner() || isLeader();

// Люди, на которых можно назначить задачу в этом проекте, — только его команда.
function teamMembers(teamId) {
  return profiles.filter((p) => p.team_id && p.team_id === teamId);
}

const displayName = (profile) => (profile ? (profile.full_name || profile.email) : t('table.unassigned'));

// «4076 Савьон» одной строкой — для выпадающих списков и заголовков.
const projectLabel = (project) =>
  !project ? '—' : (project.code ? `${project.code} ${project.name}` : project.name);

/* ---------- Экраны и сообщения ---------- */

function showScreen(name) {
  for (const id of ['setupScreen', 'authScreen', 'appScreen']) {
    $(id).hidden = id !== name;
  }
}

function showBanner(text, kind, actionLabel, onAction) {
  const banner = $('banner');
  banner.replaceChildren();
  banner.className = 'banner' + (kind === 'bad' ? ' bad' : '');

  const span = document.createElement('span');
  span.textContent = text;
  banner.append(span);

  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  banner.append(spacer);

  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.textContent = actionLabel;
    btn.addEventListener('click', onAction);
    banner.append(btn);
  }

  const close = document.createElement('button');
  close.className = 'icon-btn';
  close.textContent = '✕';
  close.addEventListener('click', () => { banner.hidden = true; });
  banner.append(close);

  banner.hidden = false;
}

function fieldError(id, message) {
  const box = $(id);
  box.textContent = message || '';
  box.hidden = !message;
}

// Сообщения Supabase приходят по-английски — переводим самые частые.
function humanError(error) {
  const msg = (error && error.message) || t('error.unknown');
  const map = {
    'Invalid login credentials': 'error.credentials',
    'User already registered': 'error.registered',
    'Email not confirmed': 'error.notConfirmed',
    'Password should be at least 6 characters': 'error.shortPassword',
    'Failed to fetch': 'error.offline',
    'is invalid': 'error.badEmail',
    'Signups not allowed': 'error.signupsOff',
    'Email logins are disabled': 'error.emailOff',
    'For security purposes': 'error.tooMany',
    'rate limit': 'error.mailLimit',
    'profiles_full_name_len': 'error.nameLong',
    'projects_name_uniq': 'error.projectNameTaken',
    'projects_code_uniq': 'error.projectCodeTaken',
    'projects_name_len': 'error.projectNameLong',
    'projects_code_len': 'error.projectCodeLong',
    'tasks_title_len': 'error.taskTitleLong',
    'tasks_notes_len': 'error.notesLong',
    'column projects.code does not exist': 'error.needMigration12',
    "'code' column": 'error.needMigration12',
    'public.teams': 'error.needMigration20',
    "'team_id' column": 'error.needMigration20',
    'violates row-level security': 'error.noRights'
  };
  for (const [needle, key] of Object.entries(map)) {
    if (msg.includes(needle)) return t(key);
  }
  if (msg.includes('relation') && msg.includes('does not exist')) {
    return t('error.noTables');
  }
  return msg;
}

/* ---------- Диалоги ---------- */

function askText({ title, label, value = '', maxLength = 120 }) {
  return new Promise((resolve) => {
    const dialog = $('promptDialog');
    $('promptTitle').textContent = title;
    $('promptLabel').textContent = label;

    const input = $('promptForm').elements.value;
    input.value = value;
    input.maxLength = maxLength;

    dialog.addEventListener('close', function onClose() {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'ok' ? input.value.trim() : null);
    });

    dialog.showModal();
    input.select();
  });
}

function askProject({ title, code = '', name = '', teamId = '', error = '' }) {
  return new Promise((resolve) => {
    const dialog = $('projectDialog');
    $('projectDialogTitle').textContent = title;
    fieldError('projectError', error);

    const f = $('projectForm').elements;
    f.code.value = code;
    f.name.value = name;

    // Владелец выбирает команду вручную, лидер всегда заводит проект в своей.
    const teamSelect = $('projectTeam');
    teamSelect.replaceChildren();
    for (const t of teams) teamSelect.append(new Option(t.name, t.id));
    teamSelect.value = teamId || (isOwner() ? (teams[0] || {}).id || '' : me.team_id || '');
    $('projectTeamField').hidden = !isOwner();

    dialog.addEventListener('close', function onClose() {
      dialog.removeEventListener('close', onClose);
      if (dialog.returnValue !== 'ok') return resolve(null);

      const values = {
        code: f.code.value.trim(),
        name: f.name.value.trim(),
        team_id: isOwner() ? teamSelect.value : me.team_id
      };
      resolve(values.name && values.team_id ? values : null);
    });

    dialog.showModal();
    f.code.focus();
  });
}

// Показываем диалог, пока номер и название не окажутся свободными.
// Сравниваем без учёта регистра: «Савьон» и «савьон» — это одно и то же.
async function askUniqueProject({ title, code = '', name = '', teamId = '', excludeId = null }) {
  let values = { code, name, teamId };
  let error = '';

  for (;;) {
    values = await askProject({ title, ...values, error });
    if (!values) return null;
    values.teamId = values.team_id;

    // Совпадения проверяем внутри команды: у разных команд названия могут повторяться.
    const others = projects.filter((p) => p.id !== excludeId && p.team_id === values.team_id);
    const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

    const dupName = others.find((p) => same(p.name, values.name));
    if (dupName) {
      error = t('dialog.nameTaken', { name: projectLabel(dupName) });
      continue;
    }

    const dupCode = values.code && others.find((p) => p.code && same(p.code, values.code));
    if (dupCode) {
      error = t('dialog.codeTaken', { code: dupCode.code, name: dupCode.name });
      continue;
    }

    // teamId — только для повторного показа диалога, в базу его слать нельзя.
    return { code: values.code, name: values.name, team_id: values.team_id };
  }
}

// Универсальный выбор одного значения из списка.
function askPick({ title, label, options, value = '' }) {
  return new Promise((resolve) => {
    const dialog = $('pickDialog');
    $('pickTitle').textContent = title;
    $('pickLabel').textContent = label;

    const select = $('pickSelect');
    select.replaceChildren();
    for (const opt of options) select.append(new Option(opt.label, opt.value));
    select.value = value;

    dialog.addEventListener('close', function onClose() {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'ok' ? select.value : null);
    });

    dialog.showModal();
  });
}

function askConfirm({ title, text }) {
  return new Promise((resolve) => {
    const dialog = $('confirmDialog');
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;

    dialog.addEventListener('close', function onClose() {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'ok');
    });

    dialog.showModal();
  });
}

/* ---------- Подключение к Supabase ---------- */

function createClient(url, key) {
  return window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

async function initFromConfig() {
  const config = await window.desktop.loadConfig();

  if (!config || !config.url || !config.key) {
    showScreen('setupScreen');
    return;
  }

  sb = createClient(config.url, config.key);

  const { data } = await sb.auth.getSession();
  if (data.session) await enterApp();
  else showAuthScreen();
}

$('setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  fieldError('setupError', '');

  const form = e.target.elements;
  const url = form.url.value.trim().replace(/\/+$/, '');
  const key = form.key.value.trim();

  if (!/^https:\/\/[^\s]+$/.test(url)) {
    fieldError('setupError', t('setup.badUrl'));
    return;
  }

  let client;
  try {
    client = createClient(url, key);
    // Пустой запрос к profiles проверяет и адрес, и ключ, и наличие таблиц.
    const { error } = await client.from('profiles').select('id').limit(1);
    if (error) throw error;
  } catch (error) {
    fieldError('setupError', humanError(error));
    return;
  }

  await window.desktop.saveConfig({ url, key });
  sb = client;
  showAuthScreen();
});

$('changeServerBtn').addEventListener('click', async () => {
  await window.desktop.saveConfig({});
  showScreen('setupScreen');
});

/* ---------- Вход и регистрация ---------- */

function showAuthScreen() {
  fieldError('authError', '');
  fieldError('authNotice', '');
  setAuthMode('signIn');
  showScreen('authScreen');
  $('authForm').elements.email.focus();
}

function setAuthMode(mode) {
  authMode = mode;
  const signUp = mode === 'signUp';

  $('authTitle').textContent = signUp ? t('auth.signUp') : t('auth.signIn');
  $('authSubmit').textContent = signUp ? t('auth.doSignUp') : t('auth.doSignIn');
  $('switchModeBtn').textContent = signUp ? t('auth.toSignIn') : t('auth.toSignUp');
  $('nameField').hidden = !signUp;
  $('authForm').elements.fullName.required = signUp;
  $('authForm').elements.password.autocomplete = signUp ? 'new-password' : 'current-password';
}

$('switchModeBtn').addEventListener('click', () => {
  fieldError('authError', '');
  fieldError('authNotice', '');
  setAuthMode(authMode === 'signUp' ? 'signIn' : 'signUp');
});

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  fieldError('authError', '');
  fieldError('authNotice', '');

  const form = e.target.elements;
  const email = form.email.value.trim();
  const password = form.password.value;
  const fullName = form.fullName.value.trim();

  const submit = $('authSubmit');
  submit.disabled = true;

  try {
    if (authMode === 'signUp') {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;

      // Если в Supabase включено подтверждение почты, сессии сразу не будет.
      if (!data.session) {
        setAuthMode('signIn');
        fieldError('authNotice', t('auth.confirmMail'));
        return;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }

    await enterApp();
  } catch (error) {
    fieldError('authError', humanError(error));
  } finally {
    submit.disabled = false;
  }
});

$('signOutBtn').addEventListener('click', async () => {
  if (channel) { await sb.removeChannel(channel); channel = null; }
  await sb.auth.signOut();
  me = null;
  projects = [];
  tasks = [];
  profiles = [];
  $('authForm').reset();
  showAuthScreen();
});

/* ---------- Загрузка данных ---------- */

async function loadMe() {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error(t('auth.expired'));

  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;

  // Профиль создаёт триггер в базе; если его почему-то нет — создаём сами.
  if (!data) {
    const fallback = {
      id: user.id,
      email: user.email,
      full_name: (user.user_metadata && user.user_metadata.full_name) || user.email.split('@')[0]
    };
    const { data: created, error: insertError } = await sb
      .from('profiles').insert(fallback).select().single();
    if (insertError) throw insertError;
    me = created;
  } else {
    me = data;
  }
}

async function loadAll() {
  // Что именно вернётся, решает база: сотрудник получит только свою команду.
  const [profilesRes, teamsRes, projectsRes, tasksRes, commentsRes, filesRes] = await Promise.all([
    sb.from('profiles').select('*').order('full_name'),
    sb.from('teams').select('*').order('created_at'),
    sb.from('projects').select('*').order('created_at'),
    sb.from('tasks').select('*'),
    sb.from('comments').select('*').order('created_at'),
    sb.from('attachments').select('*').order('created_at')
  ]);

  for (const res of [profilesRes, teamsRes, projectsRes, tasksRes, commentsRes, filesRes]) {
    if (res.error) throw res.error;
  }

  profiles = profilesRes.data;
  teams = teamsRes.data;
  projects = projectsRes.data;
  tasks = tasksRes.data;
  allComments = commentsRes.data;
  allAttachments = filesRes.data;
}

// Все клиенты слушают изменения таблиц и перечитывают данные — так задача,
// назначенная одним человеком, появляется у другого без перезапуска.
function subscribeToChanges() {
  if (channel) sb.removeChannel(channel);

  channel = sb
    .channel('team-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, async () => {
      try {
        await loadAll();
        render();
      } catch {
        setSyncState(false);
      }
    })
    .subscribe((status) => setSyncState(status === 'SUBSCRIBED'));
}

function setSyncState(live) {
  const node = $('syncState');
  node.className = 'sync-state' + (live ? ' live' : '');
  node.textContent = live ? t('nav.syncOn') : t('nav.syncOff');
}

async function refresh() {
  try {
    await loadAll();
    render();
  } catch (error) {
    showBanner(humanError(error), 'bad');
  }
}

async function enterApp() {
  try {
    await loadMe();
    await loadAll();
  } catch (error) {
    fieldError('authError', humanError(error));
    showScreen('authScreen');
    return;
  }

  // Порядок проектов и задач свой у каждого аккаунта на этом компьютере.
  loadProjectOrder();
  loadTaskOrder();

  // Человека без команды сразу отправляем на экран команды — там объяснено, что делать.
  view = (me.team_id || isOwner()) ? MY_TASKS : TEAM_VIEW;
  $('hideDone').checked = filters.hideDone;
  showScreen('appScreen');
  render();
  subscribeToChanges();
  offerLegacyImport();
}

/* ---------- Перенос данных версии 1.0 ---------- */

async function offerLegacyImport() {
  const legacy = await window.desktop.loadLegacyData();
  if (!legacy || !Array.isArray(legacy.projects) || legacy.projects.length === 0) return;

  const count = legacy.projects.reduce((n, p) => n + (p.tasks ? p.tasks.length : 0), 0);
  showBanner(
    t('legacy.found', { projects: legacy.projects.length, tasks: count }),
    'warn',
    t('legacy.import'),
    () => importLegacy(legacy)
  );
}

async function importLegacy(legacy) {
  try {
    for (const oldProject of legacy.projects) {
      const { data: project, error } = await sb
        .from('projects')
        .insert({ name: oldProject.name, created_by: me.id })
        .select()
        .single();
      if (error) throw error;

      const rows = (oldProject.tasks || []).map((t) => ({
        project_id: project.id,
        title: t.title,
        status: STATUSES.some((s) => s.id === t.status) ? t.status : 'todo',
        due: t.due || null,
        // Старый формат хранил имя строкой — сопоставляем с зарегистрированными людьми.
        assignee_id: matchProfileByName(t.assignee),
        notes: t.notes || '',
        created_by: me.id
      }));

      if (rows.length) {
        const { error: tasksError } = await sb.from('tasks').insert(rows);
        if (tasksError) throw tasksError;
      }
    }

    await window.desktop.archiveLegacyData();
    await refresh();
    showBanner(t('legacy.done'), 'ok');
  } catch (error) {
    showBanner(t('legacy.failed', { error: humanError(error) }), 'bad');
  }
}

function matchProfileByName(name) {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  const found = profiles.find(
    (p) => (p.full_name || '').toLowerCase() === needle || p.email.toLowerCase() === needle
  );
  return found ? found.id : null;
}

/* ---------- Отрисовка: сайдбар и шапка ---------- */

function myOpenTasks() {
  return tasks.filter((t) => t.assignee_id === me.id && t.status !== 'done');
}

function renderSidebar() {
  const myCount = myOpenTasks().length;
  $('myTasksCount').textContent = myCount ? String(myCount) : '';
  $('myTasksBtn').classList.toggle('active', view === MY_TASKS);

  $('teamBtn').classList.toggle('active', view === TEAM_VIEW);
  $('teamCount').textContent = isOwner()
    ? String(teams.length)
    : (me.team_id ? String(teamMembers(me.team_id).length) : '');

  // Сотрудник проекты не заводит — кнопку ему не показываем.
  $('addProjectBtn').hidden = !canManageProjects();

  $('meAvatar').className = 'avatar c' + personColor(me.id);
  $('meAvatar').textContent = initials(displayName(me));
  $('meName').textContent = displayName(me);
  $('meEmail').textContent = me.email;

  // Переключатель «Все команды / Только моя» нужен лишь владельцу.
  $('viewModeField').hidden = !isOwner();

  $('projectSortBtn').textContent = t('nav.sort' + projectSort[0].toUpperCase() + projectSort.slice(1));
  $('projectSortBtn').title = t('nav.sortHint');

  const list = $('projectList');
  list.replaceChildren();

  for (const project of visibleProjects()) {
    const btn = document.createElement('button');
    btn.className = 'project-item' + (project.id === view ? ' active' : '');
    btn.dataset.id = project.id;
    // Пока список отфильтрован, перетаскивать нечестно: не видно, куда кладём.
    btn.draggable = !projectFilter;

    const dot = document.createElement('span');
    dot.className = 'dot c' + projectColor(project.id);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = project.name;

    const parts = [dot];
    if (project.code) {
      const code = document.createElement('span');
      code.className = 'pcode';
      code.textContent = project.code;
      parts.push(code);
    }
    parts.push(name);

    const open = tasks.filter((t) => t.project_id === project.id && t.status !== 'done').length;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = open ? String(open) : '';

    btn.append(...parts, count);
    list.append(btn);
  }
}

function renderHeader() {
  if (view === TEAM_VIEW) {
    $('viewTitle').textContent = isOwner() ? t('head.teams') : t('head.myTeam');
    const myTeam = teamById(me.team_id);
    $('viewMeta').textContent = isOwner()
      ? t('head.teamsMeta', { teams: teams.length, people: profiles.length })
      : (myTeam
          ? t('head.teamMeta', { team: myTeam.name, role: roleLabel(me.role) })
          : t('head.noTeam'));

    for (const id of ['addTaskBtn', 'renameProjectBtn', 'deleteProjectBtn', 'voiceBtn']) {
      $(id).hidden = true;
    }
    $('addTeamBtn').hidden = !isOwner();
    return;
  }

  $('addTeamBtn').hidden = true;

  const isMy = view === MY_TASKS;
  const project = isMy ? null : projectById(view);

  // Голосовой ввод убран: его роль взял на себя коннектор к Claude.
  $('voiceBtn').hidden = true;
  $('addTaskBtn').hidden = !project && projects.length === 0;
  $('renameProjectBtn').hidden = !project || !canManageProjects();
  $('deleteProjectBtn').hidden = !project || !canDeleteProjects();

  if (isMy) {
    $('viewTitle').textContent = t('nav.myTasks');
    const mine = tasks.filter((x) => x.assignee_id === me.id);
    const open = mine.filter((x) => x.status !== 'done').length;
    const overdue = mine.filter(isOverdue).length;

    const parts = [
      t('head.assignedToYou', { total: mine.length }),
      t('head.inProgress', { open })
    ];
    if (overdue) parts.push(t('head.overdue', { overdue }));
    $('viewMeta').textContent = parts.join(' · ');
    return;
  }

  if (!project) {
    $('viewTitle').textContent = t('head.noProjects');
    $('viewMeta').textContent = '';
    return;
  }

  const own = tasks.filter((x) => x.project_id === project.id);
  const done = own.filter((x) => x.status === 'done').length;
  const overdue = own.filter(isOverdue).length;

  $('viewTitle').replaceChildren();
  if (project.code) {
    const code = document.createElement('span');
    code.className = 'title-code';
    code.textContent = project.code;
    $('viewTitle').append(code);
  }
  $('viewTitle').append(document.createTextNode(project.name));

  const parts = [
    t('head.tasksTotal', { total: own.length }),
    t('head.doneCount', { done })
  ];
  if (overdue) parts.push(t('head.overdue', { overdue }));
  $('viewMeta').textContent = parts.join(' · ');
}

function renderFilterOptions() {
  const keepStatus = filters.status;
  $('statusFilter').replaceChildren(new Option(t('filters.allStatuses'), ''));
  for (const s of STATUSES) $('statusFilter').append(new Option(statusLabel(s.id), s.id));
  $('statusFilter').value = keepStatus;

  const keepAssignee = filters.assignee;
  const assigneeFilter = $('assigneeFilter');
  assigneeFilter.replaceChildren(new Option(t('filters.allAssignees'), ''));
  assigneeFilter.append(new Option(t('filters.noAssignee'), 'none'));
  for (const p of profiles) assigneeFilter.append(new Option(displayName(p), p.id));
  assigneeFilter.value = keepAssignee;
  filters.assignee = assigneeFilter.value;

  // В «Моих задачах» фильтр по исполнителю смысла не имеет.
  assigneeFilter.hidden = view === MY_TASKS;

  // Там же нечего и переупорядочивать — задачи собраны из разных проектов.
  const sortBtn = $('taskSortBtn');
  sortBtn.hidden = view === MY_TASKS || view === TEAM_VIEW;
  if (!sortBtn.hidden) {
    sortBtn.textContent = boardOf(view).sort === 'manual' ? t('table.orderManual') : t('table.orderDue');
    sortBtn.title = t('table.orderHint');
  }
}

/* ---------- Отрисовка: задачи ---------- */

function scopedTasks() {
  return view === MY_TASKS
    ? tasks.filter((t) => t.assignee_id === me.id)
    : tasks.filter((t) => t.project_id === view);
}

function applyFilters(list) {
  const text = filters.text.toLowerCase();

  return list.filter((t) => {
    // В «Моих задачах» ищем ещё и по номеру с названием проекта.
    const haystack = [t.title, t.notes || '', view === MY_TASKS ? projectLabel(projectById(t.project_id)) : '']
      .join(' ')
      .toLowerCase();
    if (text && !haystack.includes(text)) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.hideDone && t.status === 'done') return false;
    if (filters.overdueOnly && !isOverdue(t)) return false;

    if (view !== MY_TASKS && filters.assignee) {
      if (filters.assignee === 'none' && t.assignee_id) return false;
      if (filters.assignee !== 'none' && t.assignee_id !== filters.assignee) return false;
    }
    return true;
  });
}

function byDueDate(a, b) {
  const ad = a.status === 'done', bd = b.status === 'done';
  if (ad !== bd) return ad ? 1 : -1;
  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due) return -1;
  if (b.due) return 1;
  return a.created_at.localeCompare(b.created_at);
}

// В «Моих задачах» задачи разложены по срочности, а не одним списком.
function groupByUrgency(list) {
  const groups = [
    { title: t('group.overdue'), items: [] },
    { title: t('group.today'), items: [] },
    { title: t('group.week'), items: [] },
    { title: t('group.later'), items: [] },
    { title: t('group.noDue'), items: [] }
  ];

  for (const task of list) {
    if (!task.due) { groups[4].items.push(task); continue; }
    const days = daysUntil(task.due);
    if (task.status !== 'done' && days < 0) groups[0].items.push(task);
    else if (days === 0) groups[1].items.push(task);
    else if (days > 0 && days <= 7) groups[2].items.push(task);
    else groups[3].items.push(task);
  }

  for (const g of groups) g.items.sort(byDueDate);
  return groups.filter((g) => g.items.length);
}

function statusCell(task) {
  const select = document.createElement('select');
  select.className = 'status-select ' + statusById(task.status).cls;
  select.dataset.action = 'status';
  select.dataset.id = task.id;

  // Каждый пункт раскрытого списка красим в свой цвет, иначе они неразличимы.
  for (const s of STATUSES) {
    const option = new Option(statusLabel(s.id), s.id, false, s.id === task.status);
    option.className = 'status-option ' + s.cls;
    select.append(option);
  }
  return select;
}

function dueCell(task) {
  const span = document.createElement('span');

  if (!task.due) {
    span.className = 'due none';
    span.textContent = '—';
    return span;
  }

  const days = daysUntil(task.due);
  const overdue = task.status !== 'done' && days < 0;
  const soon = task.status !== 'done' && days >= 0 && days <= 2;

  span.className = 'due' + (overdue ? ' overdue' : soon ? ' soon' : '');
  span.textContent = formatDue(task.due);

  const hint = task.status === 'done' ? '' : dueHint(days);
  if (hint) span.title = hint;

  return span;
}

function assigneeCell(task) {
  const wrap = document.createElement('span');
  wrap.className = 'who';

  const profile = profileById(task.assignee_id);
  const avatar = document.createElement('span');
  avatar.className = 'avatar' + (profile ? ' c' + personColor(profile.id) : '');
  avatar.textContent = profile ? initials(displayName(profile)) : '–';

  const select = document.createElement('select');
  select.className = 'assignee-select';
  select.dataset.action = 'assignee';
  select.dataset.id = task.id;
  select.append(new Option(t('table.unassigned'), '', false, !task.assignee_id));

  const project = projectById(task.project_id);
  for (const p of teamMembers(project ? project.team_id : me.team_id)) {
    select.append(new Option(displayName(p), p.id, false, p.id === task.assignee_id));
  }

  wrap.append(avatar, select);
  return wrap;
}

function projectCell(task) {
  const project = projectById(task.project_id);
  const btn = document.createElement('button');
  btn.className = 'proj-link';
  btn.dataset.action = 'goProject';
  btn.dataset.id = task.project_id;
  btn.textContent = projectLabel(project);
  return btn;
}

function actionsCell(task) {
  const wrap = document.createElement('div');
  wrap.className = 'row-actions';

  for (const [action, label, cls] of [
    ['edit', t('table.edit'), ''],
    ['delete', t('table.delete'), ' danger']
  ]) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn' + cls;
    btn.dataset.action = action;
    btn.dataset.id = task.id;
    btn.textContent = label;
    wrap.append(btn);
  }
  return wrap;
}

function taskRow(task, withProject) {
  const tr = document.createElement('tr');
  tr.className = 'task-row' + (task.status === 'done' ? ' done-row' : '');

  // Раскрытие по клику на строку. Кнопки и списки внутри строки перехватывают
  // клик раньше — closest() находит ближайший data-action, а не этот.
  tr.dataset.action = 'toggleRow';
  tr.dataset.id = task.id;
  // В «Моих задачах» задачи собраны из разных проектов и разложены по
  // срочности — там перетаскивание смысла не имеет.
  tr.draggable = view !== MY_TASKS;

  const tdTitle = document.createElement('td');
  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;

  if (view !== MY_TASKS && task.assignee_id === me.id) {
    const badge = document.createElement('span');
    badge.className = 'mine-badge';
    badge.textContent = t('table.you');
    title.append(badge);
  }
  tdTitle.append(title);

  if (task.notes) {
    const notes = document.createElement('div');
    notes.className = 'task-notes';
    notes.textContent = task.notes;
    tdTitle.append(notes);
  }

  // Кнопки-счётчики: сразу видно, что у задачи есть обсуждение или файлы.
  const counters = document.createElement('div');
  counters.className = 'counters';

  const commentCount = allComments.filter((c) => c.task_id === task.id).length;
  const fileCount = allAttachments.filter((a) => a.task_id === task.id).length;
  const open = expanded.has(task.id);

  // Значки показываем всегда, даже при нуле: иначе непонятно, куда нажимать,
  // чтобы прикрепить файл или написать первый комментарий.
  for (const [action, icon, count] of [['toggleComments', '💬', commentCount],
                                       ['toggleFiles', '📎', fileCount]]) {
    const btn = document.createElement('button');
    btn.className = 'counter' + (open ? ' on' : '') + (count ? '' : ' empty');
    btn.dataset.action = action;
    btn.dataset.id = task.id;
    btn.textContent = count ? `${icon} ${count}` : icon;
    counters.append(btn);
  }

  tdTitle.append(counters);

  const cells = [tdTitle];
  const nodes = withProject
    ? [projectCell(task), statusCell(task), dueCell(task), actionsCell(task)]
    : [statusCell(task), dueCell(task), assigneeCell(task), actionsCell(task)];

  for (const node of nodes) {
    const td = document.createElement('td');
    td.append(node);
    cells.push(td);
  }

  tr.append(...cells);
  return tr;
}

function taskTable(list, withProject) {
  const table = document.createElement('table');
  table.className = 'task-table';

  const columns = withProject
    ? [[t('table.task'), ''], [t('table.project'), 'col-proj'], [t('table.status'), 'col-status'],
       [t('table.due'), 'col-due'], ['', 'col-act']]
    : [[t('table.task'), ''], [t('table.status'), 'col-status'], [t('table.due'), 'col-due'],
       [t('table.assignee'), 'col-who'], ['', 'col-act']];

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const [label, cls] of columns) {
    const th = document.createElement('th');
    if (cls) th.className = cls;
    th.textContent = label;
    hr.append(th);
  }
  thead.append(hr);

  const tbody = document.createElement('tbody');
  for (const task of list) {
    tbody.append(taskRow(task, withProject));
    if (expanded.has(task.id)) tbody.append(extrasRow(task, columns.length));
  }

  table.append(thead, tbody);
  return table;
}

// Развёрнутая под задачей полоса: миниатюры скриншотов и лента комментариев.
function extrasRow(task, colSpan) {
  const tr = document.createElement('tr');
  tr.className = 'extras-row';

  const td = document.createElement('td');
  td.colSpan = colSpan;

  const mode = expanded.get(task.id);

  // Вложения: миниатюры плюс кнопка добавления.
  if (mode === 'files') {
    const files = allAttachments.filter((a) => a.task_id === task.id);
    const strip = document.createElement('div');
    strip.className = 'thumb-strip';

    for (const file of files) {
      // Каждое вложение в своей обёртке: на неё вешаем крестик, который
      // проявляется при наведении.
      const item = document.createElement('div');
      item.className = 'thumb-item';

      if (isImage(file)) {
        const img = document.createElement('img');
        img.className = 'thumb';
        img.alt = file.name;
        img.title = file.name;
        img.dataset.action = 'viewImage';
        img.dataset.id = file.id;
        if (thumbs.has(file.path)) img.src = thumbs.get(file.path);
        else signedUrl(file).then((url) => { thumbs.set(file.path, url); img.src = url; }).catch(() => {});
        item.append(img);
      } else {
        const link = document.createElement('button');
        link.className = 'counter';
        link.dataset.action = 'openFile';
        link.dataset.id = file.id;
        link.textContent = '📎 ' + file.name;
        item.append(link);
      }

      // Удалять вложение может тот, кто его приложил, и владелец — как в карточке.
      if (file.created_by === me.id || isOwner()) {
        const del = document.createElement('button');
        del.className = 'thumb-del';
        del.dataset.action = 'deleteFile';
        del.dataset.id = file.id;
        del.title = t('team.delete');
        del.textContent = '✕';
        item.append(del);
      }

      strip.append(item);
    }

    const add = document.createElement('button');
    add.className = 'counter add';
    add.dataset.action = 'inlineAttach';
    add.dataset.id = task.id;
    add.textContent = t('dialog.attach');
    strip.append(add);

    td.append(strip);
    tr.append(td);
    return tr;
  }

  // Обсуждение: лента и поле для нового комментария.
  for (const comment of allComments.filter((c) => c.task_id === task.id)) {
    const author = profileById(comment.author_id);
    const line = document.createElement('div');
    line.className = 'inline-comment';

    const text = document.createElement('span');
    text.textContent = `${displayName(author)} · ${new Date(comment.created_at)
      .toLocaleString(langInfo().locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}: ${comment.body}`;
    line.append(text);

    if (comment.author_id === me.id || isOwner()) {
      const del = document.createElement('button');
      del.className = 'trash';
      del.dataset.action = 'deleteComment';
      del.dataset.id = comment.id;
      del.title = t('team.delete');
      del.textContent = '🗑';
      line.append(del);
    }
    td.append(line);
  }

  const row = document.createElement('div');
  row.className = 'inline-new';

  const input = document.createElement('input');
  input.className = 'inline-input';
  input.dataset.taskId = task.id;
  input.maxLength = 4000;
  input.placeholder = t('dialog.commentPlaceholder');

  const send = document.createElement('button');
  send.className = 'counter add';
  send.dataset.action = 'inlineComment';
  send.dataset.id = task.id;
  send.textContent = t('dialog.send');

  row.append(input, send);
  td.append(row);
  tr.append(td);
  return tr;
}

// Старая разметка полосы (обе секции сразу) больше не используется.
function legacyExtras(task, td) {
  const files = allAttachments.filter((a) => a.task_id === task.id);
  if (files.length) {
    const strip = document.createElement('div');
    strip.className = 'thumb-strip';

    for (const file of files) {
      if (isImage(file)) {
        const img = document.createElement('img');
        img.className = 'thumb';
        img.alt = file.name;
        img.title = file.name;
        img.dataset.action = 'viewImage';
        img.dataset.id = file.id;
        // Ссылка временная, поэтому берём её по требованию и кладём в кэш.
        if (thumbs.has(file.path)) img.src = thumbs.get(file.path);
        else signedUrl(file).then((url) => { thumbs.set(file.path, url); img.src = url; }).catch(() => {});
        strip.append(img);
      } else {
        const link = document.createElement('button');
        link.className = 'counter';
        link.dataset.action = 'openFile';
        link.dataset.id = file.id;
        link.textContent = '📎 ' + file.name;
        strip.append(link);
      }
    }
    td.append(strip);
  }

  for (const comment of allComments.filter((c) => c.task_id === task.id)) {
    const author = profileById(comment.author_id);
    const line = document.createElement('div');
    line.className = 'inline-comment';
    line.textContent = `${displayName(author)}: ${comment.body}`;
    td.append(line);
  }

  const openBtn = document.createElement('button');
  openBtn.className = 'counter';
  openBtn.dataset.action = 'edit';
  openBtn.dataset.id = task.id;
  openBtn.textContent = t('dialog.openTask');
  td.append(openBtn);

  tr.append(td);
  return tr;
}

function emptyRow(table, text, colSpan) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = colSpan;
  td.className = 'no-tasks';
  td.textContent = text;
  tr.append(td);
  table.querySelector('tbody').append(tr);
}

function renderTasks() {
  const container = $('tasks');
  container.replaceChildren();

  if (view !== MY_TASKS && projects.length === 0) {
    const box = document.createElement('div');
    box.className = 'placeholder';

    const text = document.createElement('p');

    if (!me.team_id && !isOwner()) {
      text.textContent = t('table.notInTeamYet');
      box.append(text);
    } else if (canManageProjects()) {
      text.textContent = t('table.noProjectsYet');

      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.dataset.action = 'addProject';
      btn.textContent = t('table.createFirst');

      box.append(text, btn);
    } else {
      text.textContent = t('table.leaderCreates');
      box.append(text);
    }

    container.append(box);
    return;
  }

  const scoped = scopedTasks();
  const list = applyFilters(scoped);

  if (view === MY_TASKS) {
    if (list.length === 0) {
      const box = document.createElement('div');
      box.className = 'placeholder';
      const text = document.createElement('p');
      text.textContent = scoped.length ? t('table.noMatch') : t('table.nothingAssigned');
      box.append(text);
      container.append(box);
      return;
    }

    for (const group of groupByUrgency(list)) {
      const title = document.createElement('div');
      title.className = 'group-title';
      title.textContent = `${group.title} · ${group.items.length}`;
      container.append(title, taskTable(group.items, true));
    }
    return;
  }

  const table = taskTable(orderedTasks(list, view), false);

  if (list.length === 0) {
    emptyRow(table, scoped.length ? t('table.noMatch') : t('table.empty'), 5);
  }

  const addRow = document.createElement('tr');
  addRow.className = 'add-task-row';
  const td = document.createElement('td');
  td.colSpan = 5;

  const addBtn = document.createElement('button');
  addBtn.className = 'icon-btn';
  addBtn.dataset.action = 'add';
  addBtn.textContent = t('table.addTask');

  td.append(addBtn);
  addRow.append(td);
  table.querySelector('tbody').append(addRow);

  container.append(table);
}

/* ---------- Отрисовка: команды ---------- */

function personRow(profile, actions) {
  const row = document.createElement('div');
  row.className = 'member';

  const avatar = document.createElement('span');
  avatar.className = 'avatar c' + personColor(profile.id);
  avatar.textContent = initials(displayName(profile));

  const info = document.createElement('div');
  info.className = 'member-info';

  const name = document.createElement('div');
  name.className = 'member-name';
  name.textContent = displayName(profile);
  if (profile.id === me.id) {
    const badge = document.createElement('span');
    badge.className = 'mine-badge';
    badge.textContent = t('table.you');
    name.append(badge);
  }

  const mail = document.createElement('div');
  mail.className = 'member-mail';
  mail.textContent = profile.email;

  info.append(name, mail);

  const role = document.createElement('span');
  role.className = 'role-badge role-' + profile.role;
  role.textContent = roleLabel(profile.role);

  const open = tasks.filter((x) => x.assignee_id === profile.id && x.status !== 'done').length;
  const load = document.createElement('span');
  load.className = 'member-load';
  load.textContent = open ? t('team.busy', { count: open }) : t('team.free');

  row.append(avatar, info, load, role);

  for (const [action, label, cls] of actions) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn' + cls;
    btn.dataset.action = action;
    btn.dataset.id = profile.id;
    btn.textContent = label;
    row.append(btn);
  }

  return row;
}

function teamCard(team) {
  const card = document.createElement('div');
  card.className = 'team-card';

  const head = document.createElement('div');
  head.className = 'team-head';

  const title = document.createElement('div');
  title.className = 'team-name';
  title.textContent = team.name;

  const leader = profileById(team.leader_id);
  const sub = document.createElement('div');
  sub.className = 'team-sub';
  const projectCount = projects.filter((p) => p.team_id === team.id).length;
  sub.textContent = t('team.leader', {
    name: leader ? displayName(leader) : t('team.noLeader'),
    count: projectCount
  });

  const titleBox = document.createElement('div');
  titleBox.append(title, sub);
  head.append(titleBox);

  const canEdit = isOwner() || (isLeader() && team.id === me.team_id);

  if (canEdit) {
    const actions = document.createElement('div');
    actions.className = 'team-actions';

    const buttons = isOwner()
      ? [['addMember', t('team.addPerson'), ''],
         ['setLeader', t('team.setLeader'), ''],
         ['renameTeam', t('team.rename'), ''],
         ['deleteTeam', t('team.delete'), ' danger']]
      : [['addMember', t('team.addPerson'), '']];

    for (const [action, label, cls] of buttons) {
      const btn = document.createElement('button');
      btn.className = 'icon-btn' + cls;
      btn.dataset.action = action;
      btn.dataset.id = team.id;
      btn.textContent = label;
      actions.append(btn);
    }
    head.append(actions);
  }

  card.append(head);

  const members = teamMembers(team.id)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), langInfo().locale));

  if (members.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'no-tasks';
    empty.textContent = t('team.empty');
    card.append(empty);
  }

  for (const profile of members) {
    // Себя из команды не убираем: иначе можно случайно потерять доступ.
    const actions = canEdit && profile.id !== me.id
      ? [['removeMember', t('team.remove'), ' danger']]
      : [];
    card.append(personRow(profile, actions));
  }

  return card;
}

function renderTeam() {
  const container = $('team');
  container.replaceChildren();

  const visible = seeingAll() ? teams : teams.filter((t) => t.id === me.team_id);

  if (visible.length === 0) {
    const box = document.createElement('div');
    box.className = 'placeholder';

    const text = document.createElement('p');
    text.textContent = isOwner() ? t('team.noTeams') : t('team.notInTeam');
    box.append(text);

    if (isOwner()) {
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.dataset.action = 'addTeam';
      btn.textContent = t('team.create');
      box.append(btn);
    }

    container.append(box);
    return;
  }

  for (const team of visible) container.append(teamCard(team));

  // Люди, которых ещё никуда не взяли, — их видят владелец и лидеры.
  const free = profiles.filter((p) => !p.team_id);
  if (free.length && (isOwner() || isLeader())) {
    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = `${t('group.noTeam')} · ${free.length}`;
    container.append(title);

    const card = document.createElement('div');
    card.className = 'team-card';
    for (const profile of free) card.append(personRow(profile, []));
    container.append(card);
  }
}

function render() {
  renderSidebar();
  renderHeader();
  renderFilterOptions();

  const teamView = view === TEAM_VIEW;
  $('team').hidden = !teamView;
  $('tasks').hidden = teamView;
  document.querySelector('.filters').hidden = teamView;

  if (teamView) renderTeam();
  else renderTasks();
}

/* ---------- Действия ---------- */

async function run(action) {
  try {
    const { error } = await action();
    if (error) throw error;
    await refresh();
  } catch (error) {
    showBanner(humanError(error), 'bad');
  }
}

async function addProject() {
  const values = await askUniqueProject({ title: t('dialog.newProject') });
  if (!values) return;

  try {
    const { data, error } = await sb
      .from('projects').insert({ ...values, created_by: me.id }).select().single();
    if (error) throw error;

    view = data.id;
    await refresh();
  } catch (error) {
    showBanner(humanError(error), 'bad');
  }
}

// Без аргумента работаем с открытым проектом — так зовут кнопки в шапке;
// меню по правой кнопке передаёт id того проекта, по которому щёлкнули.
async function renameProject(id) {
  const project = projectById(id || view);
  if (!project) return;

  const values = await askUniqueProject({
    title: t('dialog.editProject'),
    code: project.code || '',
    name: project.name,
    teamId: project.team_id,
    excludeId: project.id
  });
  if (!values) return;

  run(() => sb.from('projects').update(values).eq('id', project.id));
}

async function deleteProject(id) {
  const project = projectById(id || view);
  if (!project) return;

  const count = tasks.filter((x) => x.project_id === project.id).length;
  const ok = await askConfirm({
    title: t('dialog.deleteProject'),
    text: t('dialog.deleteProjectText', { name: projectLabel(project), count })
  });
  if (!ok) return;

  if (view === project.id) view = MY_TASKS;
  run(() => sb.from('projects').delete().eq('id', project.id));
}

function openTaskDialog(task) {
  editingTaskId = task ? task.id : null;
  $('taskDialogTitle').textContent = task ? t('dialog.task') : t('dialog.newTask');

  const projectSelect = $('taskProject');
  projectSelect.replaceChildren();
  for (const p of projects) projectSelect.append(new Option(projectLabel(p), p.id));

  const statusSelect = $('taskStatus');
  statusSelect.replaceChildren();
  for (const s of STATUSES) statusSelect.append(new Option(statusLabel(s.id), s.id));

  // Список исполнителей зависит от выбранного проекта — обновляем на лету.
  const assigneeSelect = $('taskAssignee');
  const fillAssignees = (projectId) => {
    const keep = assigneeSelect.value;
    const project = projectById(projectId);
    assigneeSelect.replaceChildren(new Option(t('table.unassigned'), ''));
    for (const p of teamMembers(project ? project.team_id : me.team_id)) {
      assigneeSelect.append(new Option(displayName(p), p.id));
    }
    assigneeSelect.value = [...assigneeSelect.options].some((o) => o.value === keep) ? keep : '';
  };

  projectSelect.onchange = () => fillAssignees(projectSelect.value);

  const f = $('taskForm').elements;
  f.title.value = task ? task.title : '';
  f.status.value = task ? task.status : 'todo';
  f.due.value = task && task.due ? task.due : '';

  // Новый дедлайн — не раньше сегодня. У старых задач уже просроченную дату
  // оставляем допустимой, иначе такую задачу нельзя было бы сохранить.
  const today = todayISO();
  f.due.min = task && task.due && task.due < today ? task.due : today;
  f.due.max = '2099-12-31';

  f.assigneeId.value = task && task.assignee_id ? task.assignee_id : '';
  f.notes.value = task ? (task.notes || '') : '';

  const defaultProject = task ? task.project_id : (view === MY_TASKS ? (projects[0] || {}).id : view);
  f.projectId.value = defaultProject || '';

  fillAssignees(f.projectId.value);
  f.assigneeId.value = task && task.assignee_id ? task.assignee_id : '';

  // Обсуждение и файлы есть только у сохранённой задачи — новой ещё некуда их класть.
  $('taskExtras').hidden = !task;
  comments = [];
  attachments = [];
  if (task) loadExtras(task.id);

  $('taskDialog').showModal();
  f.title.focus();
}

/* ---------- Комментарии и вложения ---------- */

async function loadExtras(taskId) {
  fieldError('extrasError', '');
  renderExtras();

  const [commentsRes, filesRes] = await Promise.all([
    sb.from('comments').select('*').eq('task_id', taskId).order('created_at'),
    sb.from('attachments').select('*').eq('task_id', taskId).order('created_at')
  ]);

  if (commentsRes.error || filesRes.error) {
    showBanner(humanError(commentsRes.error || filesRes.error), 'bad');
    return;
  }

  comments = commentsRes.data;
  attachments = filesRes.data;
  renderExtras();
}

const isImage = (file) => /^image\//.test(file.mime);

function renderExtras() {
  const files = $('attachList');
  files.replaceChildren();

  if (attachments.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'meta-note';
    empty.textContent = t('dialog.noFiles');
    files.append(empty);
  }

  for (const file of attachments) {
    const row = document.createElement('div');
    row.className = 'attach';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'attach-name';
    open.dataset.action = isImage(file) ? 'viewImage' : 'openFile';
    open.dataset.id = file.id;
    open.textContent = (isImage(file) ? '🖼 ' : '📎 ') + file.name;

    const size = document.createElement('span');
    size.className = 'meta-note';
    size.textContent = `${Math.max(1, Math.round(file.size_bytes / 1024))} КБ`;

    row.append(open, size);

    if (file.created_by === me.id || isOwner()) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn danger';
      del.dataset.action = 'deleteFile';
      del.dataset.id = file.id;
      del.textContent = t('table.delete');
      row.append(del);
    }

    files.append(row);
  }

  const list = $('commentList');
  list.replaceChildren();

  if (comments.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'meta-note';
    empty.textContent = t('dialog.noComments');
    list.append(empty);
  }

  for (const comment of comments) {
    const author = profileById(comment.author_id);
    const item = document.createElement('div');
    item.className = 'comment';

    const avatar = document.createElement('span');
    avatar.className = 'avatar' + (author ? ' c' + personColor(author.id) : '');
    avatar.textContent = author ? initials(displayName(author)) : '–';

    const body = document.createElement('div');
    body.className = 'comment-body';

    const head = document.createElement('div');
    head.className = 'comment-head';
    head.textContent = `${displayName(author)} · ${new Date(comment.created_at)
      .toLocaleString(langInfo().locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;

    const text = document.createElement('div');
    text.className = 'comment-text';
    text.textContent = comment.body;

    body.append(head, text);
    item.append(avatar, body);

    if (comment.author_id === me.id || isOwner()) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn danger';
      del.dataset.action = 'deleteComment';
      del.dataset.id = comment.id;
      del.textContent = t('table.delete');
      item.append(del);
    }

    list.append(item);
  }
}

async function addComment() {
  const input = $('commentInput');
  const body = input.value.trim();
  if (!body || !editingTaskId) return;

  try {
    const { error } = await sb
      .from('comments').insert({ task_id: editingTaskId, author_id: me.id, body });
    if (error) throw error;

    input.value = '';
    await loadExtras(editingTaskId);
    await refresh();
  } catch (error) {
    fieldError('extrasError', humanError(error));
  }
}

async function uploadAttachment(file) {
  if (!editingTaskId) return;

  // Имя в хранилище делаем безопасным: кириллица и пробелы в путях ломают ссылки.
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-60);
  const objectPath = `${editingTaskId}/${crypto.randomUUID()}-${safe}`;

  try {
    // Без таймаута зависший запрос выглядит как вечное «Загружаю…»
    // и не даёт понять, что пошло не так.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Хранилище не ответило за 60 секунд')), 60000));

    const { error: uploadError } = await Promise.race([
      sb.storage.from('attachments')
        .upload(objectPath, file, { contentType: file.type || 'application/octet-stream' }),
      timeout
    ]);
    if (uploadError) throw uploadError;

    const { error } = await sb.from('attachments').insert({
      task_id: editingTaskId,
      path: objectPath,
      name: file.name,
      mime: file.type || '',
      size_bytes: file.size,
      created_by: me.id
    });
    if (error) throw error;

    await loadExtras(editingTaskId);
    await refresh();
  } catch (error) {
    fieldError('extrasError', humanError(error));
  }
}

// Бакет закрытый, поэтому на каждое открытие берём временную ссылку.
async function signedUrl(file) {
  const { data, error } = await sb.storage
    .from('attachments').createSignedUrl(file.path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/* ---------- Просмотр картинки с приближением ---------- */

// Скриншот интерфейса в размер окна не читается, поэтому его можно приблизить:
// колесом, кнопками и двойным щелчком, а увеличенную картинку — таскать мышью.
let imageUrl = null;
let zoom = 1;            // 1 — пиксель в пиксель
let fitZoom = 1;         // масштаб, при котором картинка целиком видна
let pan = { x: 0, y: 0 };

const MAX_ZOOM = 8;

function applyZoom() {
  const img = $('imageView');
  img.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  $('zoomLevel').textContent = Math.round(zoom * 100) + '%';
  $('imageStage').classList.toggle('zoomed', zoom > fitZoom + 0.001);
}

// Вписываем картинку в окно, но не растягиваем мелкую сверх её размера.
function fitImage() {
  const img = $('imageView');
  const stage = $('imageStage');
  if (!img.naturalWidth) return;

  const box = stage.getBoundingClientRect();
  fitZoom = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight, 1);
  zoom = fitZoom;
  pan = { x: 0, y: 0 };
  applyZoom();
}

// Приближаем к точке под курсором, иначе на большом скриншоте не поймать нужное место.
function zoomAt(factor, clientX, clientY) {
  const next = Math.min(Math.max(zoom * factor, fitZoom / 4), MAX_ZOOM);
  if (next === zoom) return;

  const box = $('imageStage').getBoundingClientRect();
  const cx = (clientX ?? box.left + box.width / 2) - box.left - box.width / 2;
  const cy = (clientY ?? box.top + box.height / 2) - box.top - box.height / 2;
  const k = next / zoom;

  pan = { x: cx - (cx - pan.x) * k, y: cy - (cy - pan.y) * k };
  zoom = next;
  applyZoom();
}

$('imageView').addEventListener('load', fitImage);
$('zoomIn').addEventListener('click', () => zoomAt(1.25));
$('zoomOut').addEventListener('click', () => zoomAt(1 / 1.25));
$('zoomLevel').addEventListener('click', () => {
  // Кнопка с процентами переключает «целиком» и «пиксель в пиксель».
  if (Math.abs(zoom - 1) < 0.001) fitImage();
  else zoomAt(1 / zoom);
});

$('openOutside').addEventListener('click', () => {
  if (imageUrl) window.desktop.openExternal(imageUrl);
});

$('imageStage').addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
}, { passive: false });

$('imageStage').addEventListener('dblclick', (e) => {
  if (Math.abs(zoom - fitZoom) < 0.001) zoomAt(2 / zoom, e.clientX, e.clientY);
  else fitImage();
});

// Перетаскивание приближённой картинки. Ведём по указателю, чтобы курсор
// не терялся за краем окна.
$('imageStage').addEventListener('pointerdown', (e) => {
  if (zoom <= fitZoom + 0.001) return;
  e.preventDefault();
  $('imageStage').setPointerCapture(e.pointerId);

  const start = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  const move = (ev) => {
    pan = { x: ev.clientX - start.x, y: ev.clientY - start.y };
    applyZoom();
  };
  const up = () => {
    $('imageStage').removeEventListener('pointermove', move);
    $('imageStage').removeEventListener('pointerup', up);
  };
  $('imageStage').addEventListener('pointermove', move);
  $('imageStage').addEventListener('pointerup', up);
});

$('imageDialog').addEventListener('keydown', (e) => {
  if (e.key === '+' || e.key === '=') zoomAt(1.25);
  if (e.key === '-') zoomAt(1 / 1.25);
  if (e.key === '0') fitImage();
});

$('imageDialog').addEventListener('close', () => { imageUrl = null; });

async function openAttachment(id, inApp) {
  const file = attachments.find((a) => a.id === id) || allAttachments.find((a) => a.id === id);
  if (!file) return;

  try {
    const url = await signedUrl(file);
    if (!inApp) {
      await window.desktop.openExternal(url);
      return;
    }
    $('imageName').textContent = file.name;
    $('imageView').src = url;
    imageUrl = url;
    $('imageDialog').showModal();
    fitImage();
  } catch (error) {
    showBanner(humanError(error), 'bad');
  }
}

// Вложение удаляют и из карточки задачи, и прямо из полосы под задачей,
// поэтому ищем его в обоих списках — как и при открытии.
async function deleteAttachment(id) {
  const file = attachments.find((a) => a.id === id) || allAttachments.find((a) => a.id === id);
  if (!file) return;

  const ok = await askConfirm({
    title: t('dialog.deleteFile'),
    text: t('dialog.deleteFileText', { name: file.name })
  });
  if (!ok) return;

  try {
    await sb.storage.from('attachments').remove([file.path]);
    const { error } = await sb.from('attachments').delete().eq('id', id);
    if (error) throw error;

    thumbs.delete(file.path);
    if (editingTaskId) await loadExtras(editingTaskId);
    await refresh();
  } catch (error) {
    // Из таблицы карточка не открыта, и поле с ошибкой в ней не видно.
    if (editingTaskId) fieldError('extrasError', humanError(error));
    else showBanner(humanError(error), 'bad');
  }
}

async function submitTaskDialog() {
  const f = $('taskForm').elements;
  const values = {
    title: f.title.value.trim(),
    project_id: f.projectId.value,
    status: f.status.value,
    due: f.due.value || null,
    assignee_id: f.assigneeId.value || null,
    notes: f.notes.value.trim()
  };

  if (!values.title || !values.project_id) return;

  const id = editingTaskId;
  editingTaskId = null;

  run(() => id
    ? sb.from('tasks').update(values).eq('id', id)
    : sb.from('tasks').insert({ ...values, created_by: me.id }));
}

async function deleteTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const ok = await askConfirm({
    title: t('dialog.deleteTask'),
    text: t('dialog.deleteTaskText', { name: task.title })
  });
  if (!ok) return;

  run(() => sb.from('tasks').delete().eq('id', id));
}

/* ---------- Действия с командами ---------- */

async function addTeam() {
  const name = await askText({ title: t('dialog.newTeam'), label: t('dialog.title'), maxLength: 40 });
  if (!name) return;

  if (teams.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) {
    showBanner(t('team.exists', { name }), 'bad');
    return;
  }

  run(() => sb.from('teams').insert({ name }));
}

async function renameTeam(id) {
  const team = teamById(id);
  if (!team) return;

  const name = await askText({
    title: t('dialog.renameTeam'), label: t('dialog.title'), value: team.name, maxLength: 40
  });
  if (!name) return;

  run(() => sb.from('teams').update({ name }).eq('id', id));
}

async function deleteTeam(id) {
  const team = teamById(id);
  if (!team) return;

  const projectCount = projects.filter((p) => p.team_id === id).length;
  const memberCount = teamMembers(id).length;

  const ok = await askConfirm({
    title: t('dialog.deleteTeam'),
    text: t('dialog.deleteTeamText', {
      name: team.name, projects: projectCount, members: memberCount
    })
  });
  if (!ok) return;

  if (view === TEAM_VIEW || projects.some((p) => p.id === view && p.team_id === id)) view = TEAM_VIEW;
  run(() => sb.from('teams').delete().eq('id', id));
}

async function setLeader(id) {
  const members = teamMembers(id);
  if (members.length === 0) {
    showBanner(t('team.needMembers'), 'bad');
    return;
  }

  const team = teamById(id);
  const chosen = await askPick({
    title: t('dialog.teamLeader'),
    label: t('dialog.whoLeads', { name: team ? team.name : '' }),
    options: members.map((p) => ({ label: displayName(p), value: p.id })),
    value: team && team.leader_id ? team.leader_id : ''
  });
  if (!chosen) return;

  try {
    // Прежний лидер становится обычным сотрудником, новый получает роль лидера.
    const previous = team && team.leader_id;
    if (previous && previous !== chosen) {
      const { error } = await sb.from('profiles').update({ role: 'member' }).eq('id', previous);
      if (error) throw error;
    }

    const { error: roleError } = await sb.from('profiles').update({ role: 'leader' }).eq('id', chosen);
    if (roleError) throw roleError;

    const { error: teamError } = await sb.from('teams').update({ leader_id: chosen }).eq('id', id);
    if (teamError) throw teamError;

    await refresh();
  } catch (error) {
    showBanner(humanError(error), 'bad');
  }
}

async function addMember(teamId) {
  const free = profiles.filter((p) => !p.team_id);
  if (free.length === 0) {
    showBanner(t('team.allTaken'), 'warn');
    return;
  }

  const chosen = await askPick({
    title: t('dialog.addToTeam'),
    label: t('dialog.whoToAdd'),
    options: free.map((p) => ({ label: `${displayName(p)} — ${p.email}`, value: p.id }))
  });
  if (!chosen) return;

  run(() => sb.from('profiles').update({ team_id: teamId }).eq('id', chosen));
}

async function removeMember(id) {
  const profile = profileById(id);
  if (!profile) return;

  const assigned = tasks.filter((x) => x.assignee_id === id && x.status !== 'done').length;
  const ok = await askConfirm({
    title: t('dialog.removeMember'),
    text: assigned
      ? t('dialog.removeMemberBusy', { name: displayName(profile), count: assigned })
      : t('dialog.removeMemberText', { name: displayName(profile) })
  });
  if (!ok) return;

  try {
    // Сначала снимаем задачи: база не разрешит исполнителя не из команды проекта.
    if (assigned) {
      const { error } = await sb.from('tasks').update({ assignee_id: null }).eq('assignee_id', id);
      if (error) throw error;
    }

    const updates = { team_id: null };
    if (profile.role === 'leader') updates.role = 'member';

    const { error: profileError } = await sb.from('profiles').update(updates).eq('id', id);
    if (profileError) throw profileError;

    await refresh();
  } catch (error) {
    showBanner(humanError(error), 'bad');
  }
}

async function renameMe() {
  const name = await askText({
    title: t('dialog.whoAreYou'),
    label: t('auth.name'),
    value: me.full_name || '',
    maxLength: 20
  });
  if (!name) return;

  try {
    const { data, error } = await sb
      .from('profiles').update({ full_name: name }).eq('id', me.id).select().single();
    if (error) throw error;
    me = data;
    await refresh();
  } catch (error) {
    showBanner(humanError(error), 'bad');
  }
}

/* ---------- События ---------- */

$('myTasksBtn').addEventListener('click', () => { view = MY_TASKS; render(); });
$('projectSearch').addEventListener('input', (e) => {
  projectFilter = e.target.value.trim().toLowerCase();
  renderSidebar();
});

$('teamBtn').addEventListener('click', () => { view = TEAM_VIEW; render(); });
$('addTeamBtn').addEventListener('click', addTeam);

$('team').addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const { action, id } = target.dataset;
  const handlers = {
    addTeam, renameTeam, deleteTeam, setLeader, addMember, removeMember
  };
  if (handlers[action]) handlers[action](id);
});

$('projectList').addEventListener('click', (e) => {
  const btn = e.target.closest('.project-item');
  if (!btn) return;
  view = btn.dataset.id;
  render();
});

/* ---------- Перетаскивание проектов ---------- */

let draggingId = null;

// Подсветку места вставки рисуем на самом пункте: рамка сверху или снизу.
function clearDropMarks() {
  for (const el of $('projectList').querySelectorAll('.drop-before, .drop-after')) {
    el.classList.remove('drop-before', 'drop-after');
  }
}

// Ниже середины пункта — кладём после него, выше — перед.
function dropTarget(e) {
  const btn = e.target.closest('.project-item');
  if (!btn || btn.dataset.id === draggingId) return null;
  const box = btn.getBoundingClientRect();
  return { id: btn.dataset.id, after: e.clientY > box.top + box.height / 2, btn };
}

$('projectList').addEventListener('dragstart', (e) => {
  const btn = e.target.closest('.project-item');
  if (!btn || !btn.draggable) return;

  draggingId = btn.dataset.id;
  btn.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggingId);
});

$('projectList').addEventListener('dragover', (e) => {
  if (!draggingId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const target = dropTarget(e);
  clearDropMarks();
  if (target) target.btn.classList.add(target.after ? 'drop-after' : 'drop-before');
});

$('projectList').addEventListener('drop', (e) => {
  if (!draggingId) return;
  e.preventDefault();

  const target = dropTarget(e);
  clearDropMarks();
  if (target) moveProject(draggingId, target.id, target.after);
  draggingId = null;
});

$('projectList').addEventListener('dragend', () => {
  draggingId = null;
  clearDropMarks();
  for (const el of $('projectList').querySelectorAll('.dragging')) el.classList.remove('dragging');
});

/* ---------- Перетаскивание задач внутри проекта ---------- */

let draggingTaskId = null;

function clearTaskDropMarks() {
  for (const el of $('tasks').querySelectorAll('.drop-before, .drop-after')) {
    el.classList.remove('drop-before', 'drop-after');
  }
}

function taskDropTarget(e) {
  const row = e.target.closest('.task-row');
  if (!row || row.dataset.id === draggingTaskId) return null;
  const box = row.getBoundingClientRect();
  return { id: row.dataset.id, after: e.clientY > box.top + box.height / 2, row };
}

$('tasks').addEventListener('dragstart', (e) => {
  const row = e.target.closest('.task-row');
  if (!row || !row.draggable) return;

  draggingTaskId = row.dataset.id;
  row.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggingTaskId);
});

$('tasks').addEventListener('dragover', (e) => {
  if (!draggingTaskId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const target = taskDropTarget(e);
  clearTaskDropMarks();
  if (target) target.row.classList.add(target.after ? 'drop-after' : 'drop-before');
});

$('tasks').addEventListener('drop', (e) => {
  if (!draggingTaskId) return;
  e.preventDefault();

  const target = taskDropTarget(e);
  clearTaskDropMarks();
  if (target && view !== MY_TASKS) moveTask(view, draggingTaskId, target.id, target.after);
  draggingTaskId = null;
});

$('tasks').addEventListener('dragend', () => {
  draggingTaskId = null;
  clearTaskDropMarks();
  for (const el of $('tasks').querySelectorAll('.dragging')) el.classList.remove('dragging');
});

// Вернуть задачи к сортировке по сроку и снова к своему порядку.
$('taskSortBtn').addEventListener('click', () => {
  const board = boardOf(view);
  taskBoards[view] = { sort: board.sort === 'manual' ? 'due' : 'manual', order: board.order };

  // Порядок «свой» без разложенного списка — это тот же порядок по сроку,
  // просто зафиксированный: дальше его можно менять мышью.
  if (taskBoards[view].sort === 'manual' && board.order.length === 0) {
    taskBoards[view].order = orderedTasks(tasks.filter((x) => x.project_id === view), view)
      .map((x) => x.id);
  }
  saveTaskOrder();
  render();
});

// Кнопка сортировки: вручную → по номеру → по названию → снова вручную.
// Ручной порядок при этом сохраняется и возвращается как был.
$('projectSortBtn').addEventListener('click', () => {
  const next = { manual: 'code', code: 'name', name: 'manual' };
  projectSort = next[projectSort];
  saveProjectOrder();
  renderSidebar();
});

/* ---------- Меню по правой кнопке ---------- */

let menuProjectId = null;

function closeProjectMenu() {
  menuProjectId = null;
  $('projectMenu').hidden = true;
}

function openProjectMenu(id, x, y) {
  const project = projectById(id);
  if (!project) return;

  const menu = $('projectMenu');
  menu.querySelector('[data-action="rename"]').hidden = !canManageProjects();
  menu.querySelector('[data-action="delete"]').hidden = !canDeleteProjects();
  if (!canManageProjects() && !canDeleteProjects()) return;

  menuProjectId = id;
  menu.hidden = false;

  // Показали — теперь известен размер, и меню можно удержать в пределах окна.
  const box = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - box.width - 4) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - box.height - 4) + 'px';
}

$('projectList').addEventListener('contextmenu', (e) => {
  const btn = e.target.closest('.project-item');
  if (!btn) return;
  e.preventDefault();
  openProjectMenu(btn.dataset.id, e.clientX, e.clientY);
});

$('projectMenu').addEventListener('click', (e) => {
  const item = e.target.closest('[data-action]');
  if (!item) return;

  const id = menuProjectId;
  closeProjectMenu();
  if (item.dataset.action === 'rename') renameProject(id);
  if (item.dataset.action === 'delete') deleteProject(id);
});

document.addEventListener('mousedown', (e) => {
  if (!$('projectMenu').hidden && !e.target.closest('#projectMenu')) closeProjectMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProjectMenu();
});
window.addEventListener('blur', closeProjectMenu);

$('addProjectBtn').addEventListener('click', addProject);
$('renameProjectBtn').addEventListener('click', () => renameProject());
$('deleteProjectBtn').addEventListener('click', () => deleteProject());
$('renameMeBtn').addEventListener('click', renameMe);

$('addTaskBtn').addEventListener('click', () => {
  if (projects.length === 0) addProject();
  else openTaskDialog(null);
});

$('tasks').addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const { action, id } = target.dataset;

  if (action === 'addProject') addProject();
  if (action === 'add') openTaskDialog(null);
  if (action === 'goProject') { view = id; render(); }
  if (action === 'delete') deleteTask(id);
  if (action === 'viewImage') openAttachment(id, true);
  if (action === 'openFile') openAttachment(id, false);
  if (action === 'deleteFile') deleteAttachment(id);
  if (action === 'deleteComment') run(() => sb.from('comments').delete().eq('id', id));

  // Каждый значок открывает свою секцию; повторное нажатие сворачивает.
  const modes = { toggleComments: 'comments', toggleFiles: 'files', toggleRow: 'comments' };
  if (modes[action]) {
    if (expanded.get(id) === modes[action]) expanded.delete(id);
    else expanded.set(id, modes[action]);
    renderTasks();
  }

  if (action === 'inlineComment') {
    const input = target.parentElement.querySelector('.inline-input');
    const body = input.value.trim();
    if (!body) return;
    run(() => sb.from('comments').insert({ task_id: id, author_id: me.id, body }));
  }

  if (action === 'inlineAttach') {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.style.position = 'fixed';
    picker.style.left = '-9999px';
    document.body.append(picker);
    picker.addEventListener('change', async () => {
      const file = picker.files[0];
      picker.remove();
      if (!file) return;
      editingTaskId = id;          // uploadAttachment кладёт файл в папку этой задачи
      await uploadAttachment(file);
    });
    picker.click();
  }
  if (action === 'edit') {
    const task = tasks.find((t) => t.id === id);
    if (task) openTaskDialog(task);
  }
});

// Поля быстрых комментариев создаются на лету, поэтому слушаем всю таблицу.
$('tasks').addEventListener('keydown', (e) => {
  const input = e.target.closest('.inline-input');
  if (!input || e.key !== 'Enter' || e.shiftKey) return;

  e.preventDefault();
  const body = input.value.trim();
  if (!body) return;

  input.value = '';
  run(() => sb.from('comments').insert({
    task_id: input.dataset.taskId, author_id: me.id, body
  }));
});

$('tasks').addEventListener('change', (e) => {
  const select = e.target.closest('[data-action]');
  if (!select) return;

  const { action, id } = select.dataset;
  if (action === 'status') run(() => sb.from('tasks').update({ status: select.value }).eq('id', id));
  if (action === 'assignee') {
    run(() => sb.from('tasks').update({ assignee_id: select.value || null }).eq('id', id));
  }
});

// Кнопки «Отмена» закрывают диалог сами. Обычными submit-кнопками их делать нельзя:
// Enter в поле срабатывает на первой submit-кнопке формы, то есть на отмене.
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', (e) => {
    e.target.closest('dialog').close(e.target.dataset.close);
  });
}

// Браузерное сообщение о нарушении min показывается по-английски — заменяем своим.
const dueInput = $('taskForm').elements.due;
dueInput.addEventListener('invalid', () => {
  dueInput.setCustomValidity(t('due.minDate'));
});
dueInput.addEventListener('input', () => dueInput.setCustomValidity(''));

$('taskDialog').addEventListener('close', () => {
  if ($('taskDialog').returnValue === 'ok') submitTaskDialog();
  else editingTaskId = null;
});

$('searchInput').addEventListener('input', (e) => {
  filters.text = e.target.value.trim();
  renderTasks();
});

$('statusFilter').addEventListener('change', (e) => { filters.status = e.target.value; renderTasks(); });
$('assigneeFilter').addEventListener('change', (e) => { filters.assignee = e.target.value; renderTasks(); });
$('overdueOnly').addEventListener('change', (e) => { filters.overdueOnly = e.target.checked; renderTasks(); });
$('hideDone').addEventListener('change', (e) => { filters.hideDone = e.target.checked; renderTasks(); });

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'n' && !typing && me && projects.length) {
    e.preventDefault();
    openTaskDialog(null);
  }
});

/* ---------- Помощник по задачам ---------- */

async function openAiSettings() {
  const status = await window.desktop.ai.status();
  const f = $('aiForm').elements;

  const select = $('aiProvider');
  select.replaceChildren(
    new Option(t('ai.claude'), 'claude'),
    new Option(t('ai.openai'), 'openai')
  );
  select.value = status.provider;

  f.key.value = '';
  f.key.placeholder = status.hasKey ? '••••••••' : t('ai.keyPlaceholder');
  fieldError('aiError', '');

  $('aiDialog').showModal();
}

// Речь → текст → поля задачи. Пользователь всегда подтверждает результат сам:
// помощник только заполняет форму, ничего не сохраняет молча.
async function startVoiceTask() {
  if (recorder) {
    recorder.stop();
    return;
  }

  const status = await window.desktop.ai.status();
  if (!status.hasKey) {
    showBanner(t('ai.notSet'), 'warn', t('nav.assistant'), openAiSettings);
    return;
  }
  if (status.provider !== 'openai') {
    showBanner(t('ai.voiceNeedsOpenAi'), 'warn', t('nav.assistant'), openAiSettings);
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showBanner(t('ai.failed', { error: 'нет доступа к микрофону' }), 'bad');
    return;
  }

  const chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => chunks.push(e.data);

  recorder.onstop = async () => {
    stream.getTracks().forEach((track) => track.stop());
    recorder = null;
    $('voiceBtn').classList.remove('recording');
    showBanner(t('ai.thinking'), 'warn');

    try {
      const buffer = await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer();
      const text = (await window.desktop.ai.transcribe(buffer)).trim();
      if (!text) {
        showBanner(t('ai.nothingHeard'), 'bad');
        return;
      }
      await fillTaskFromText(text);
    } catch (error) {
      showBanner(t('ai.failed', { error: error.message }), 'bad');
    }
  };

  recorder.start();
  $('voiceBtn').classList.add('recording');
  showBanner(t('ai.listening'), 'warn');
}

async function fillTaskFromText(text) {
  const scope = visibleProjects();
  const draft = await window.desktop.ai.extract({
    text,
    today: todayISO(),
    projects: scope.map(projectLabel),
    people: profiles.map(displayName)
  });

  const matchProject = scope.find((p) => projectLabel(p) === draft.project)
    || scope.find((p) => draft.project && projectLabel(p).toLowerCase().includes(draft.project.toLowerCase()));

  const target = matchProject || scope[0];
  if (!target) {
    showBanner(t('table.noProjectsYet'), 'bad');
    return;
  }

  const assignee = teamMembers(target.team_id)
    .find((p) => displayName(p).toLowerCase() === (draft.assignee || '').toLowerCase());

  openTaskDialog(null);

  const f = $('taskForm').elements;
  f.title.value = draft.title || text.slice(0, 200);
  f.projectId.value = target.id;
  f.projectId.dispatchEvent(new Event('change'));
  if (assignee) f.assigneeId.value = assignee.id;
  if (draft.due && draft.due >= todayISO() && draft.due <= '2099-12-31') f.due.value = draft.due;
  f.notes.value = draft.notes || '';

  showBanner(t('ai.checkTask'), 'ok');
}

/* ---------- Обновления ---------- */

window.desktop.updates.onAvailable((version) => {
  showBanner(t('update.available', { version }), 'warn');
});

window.desktop.updates.onReady((version) => {
  showBanner(t('update.ready', { version }), 'ok', t('update.install'),
    () => window.desktop.updates.install());
});

/* ---------- События новых экранов ---------- */

// Код привязки создаётся в базе от имени вошедшего и несёт его сессию,
// поэтому на странице подключения пароль вводить не нужно.
$('pairBtn').addEventListener('click', async () => {
  try {
    const { data: sessionData } = await sb.auth.getSession();
    const session = sessionData.session;
    if (!session) throw new Error(t('auth.expired'));

    const { data: code, error } = await sb.rpc('issue_pairing_code', {
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in
      }
    });
    if (error) throw error;

    $('confirmTitle').textContent = t('nav.pairTitle');
    $('confirmText').textContent = `${code}\n\n${t('nav.pairText')}`;
    $('confirmOk').hidden = true;
    $('confirmDialog').showModal();
    $('confirmDialog').addEventListener('close', function restore() {
      $('confirmDialog').removeEventListener('close', restore);
      $('confirmOk').hidden = false;
    });
  } catch (error) {
    showBanner(t('nav.pairFailed', { error: humanError(error) }), 'bad');
  }
});

$('aiBtn').addEventListener('click', openAiSettings);
$('voiceBtn').addEventListener('click', startVoiceTask);

$('aiDialog').addEventListener('close', async () => {
  if ($('aiDialog').returnValue !== 'ok') return;
  const f = $('aiForm').elements;
  await window.desktop.ai.save({ provider: f.provider.value, key: f.key.value.trim() });
});

$('aiForget').addEventListener('click', async () => {
  await window.desktop.ai.forget();
  $('aiDialog').close('cancel');
});

$('viewMode').addEventListener('change', (e) => {
  viewAs = e.target.value;
  // Если открыт проект чужой команды, он только что исчез из списка.
  if (view !== MY_TASKS && view !== TEAM_VIEW && !visibleProjects().some((p) => p.id === view)) {
    view = MY_TASKS;
  }
  render();
});

$('commentBtn').addEventListener('click', addComment);

// Enter отправляет комментарий, Shift+Enter переносит строку — как в мессенджерах.
$('commentInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();
    addComment();
  }
});

// Ctrl+Enter в любом месте окна задачи сохраняет её целиком.
$('taskDialog').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    $('taskDialog').close('ok');
  }
});

$('attachBtn').addEventListener('click', () => {
  // Поле обязательно должно быть в документе: по неприсоединённому элементу
  // Electron окно выбора файла не открывает.
  // Не прячем через hidden/display:none — по такому полю Chromium окно выбора
  // файла не открывает. Убираем его за край экрана.
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.style.position = 'fixed';
  picker.style.left = '-9999px';
  document.body.append(picker);

  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    picker.remove();
    if (!file) return;

    fieldError('extrasError', `Загружаю «${file.name}»…`);
    await uploadAttachment(file);
  });

  picker.click();
});

$('taskExtras').addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const { action, id } = target.dataset;
  if (action === 'viewImage') openAttachment(id, true);
  if (action === 'openFile') openAttachment(id, false);
  if (action === 'deleteFile') deleteAttachment(id);
  if (action === 'deleteComment') {
    run(() => sb.from('comments').delete().eq('id', id)).then(() => loadExtras(editingTaskId));
  }
});

/* ---------- Язык ---------- */

// Три переключателя (настройка, вход, боковая панель) показывают одно и то же.
const LANG_SELECTS = ['langSetup', 'langAuth', 'langApp'];

function applyLanguage() {
  applyDirection();
  translateStatic();

  for (const id of LANG_SELECTS) $(id).value = currentLang;

  const modes = $('viewMode');
  modes.replaceChildren(
    new Option(t('view.asOwner'), 'owner'),
    new Option(t('view.asMember'), 'member')
  );
  modes.value = viewAs;

  // Надписи, которые зависят от состояния, статической подстановкой не покрыть.
  setAuthMode(authMode);
  if (me) render();
}

function initLanguageSelects() {
  for (const id of LANG_SELECTS) {
    const select = $(id);
    select.replaceChildren();
    for (const lang of LANGUAGES) select.append(new Option(lang.label, lang.id));
    select.value = currentLang;

    select.addEventListener('change', () => {
      setLanguage(select.value);
      applyLanguage();
    });
  }
}

/* ---------- Старт ---------- */

initLanguageSelects();
applyLanguage();

initFromConfig().catch((error) => {
  fieldError('setupError', humanError(error));
  showScreen('setupScreen');
});
