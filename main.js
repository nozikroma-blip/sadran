const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const Anthropic = require('@anthropic-ai/sdk');

let configFile;
let aiFile;
let legacyDataFile;
let mainWindow = null;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Пишем через временный файл, чтобы не потерять настройки при сбое во время записи.
function writeJson(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// До версии 2.2 приложение называлось «Проекты» и хранило файлы в другой папке.
function migrateFromOldFolder(userData) {
  const oldDir = path.join(app.getPath('appData'), 'projects-desktop');
  if (oldDir === userData || !fs.existsSync(oldDir)) return;

  for (const file of ['config.json', 'data.json']) {
    const from = path.join(oldDir, file);
    const to = path.join(userData, file);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      try {
        fs.copyFileSync(from, to);
      } catch {
        // Не критично: пользователь просто введёт настройки заново.
      }
    }
  }
}

/* ---------- Помощник по задачам ---------- */

// Ключ от Claude или ChatGPT лежит только на этом компьютере, в общую базу
// он не попадает: иначе его увидел бы владелец базы и вся команда.
const loadAi = () => readJson(aiFile, { provider: 'claude', key: '' });

const TASK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Краткая формулировка задачи' },
    project: { type: 'string', description: 'Название или номер проекта, дословно из речи' },
    assignee: { type: 'string', description: 'Имя исполнителя, дословно из речи' },
    due: { type: 'string', description: 'Дедлайн в формате ГГГГ-ММ-ДД, пустая строка если не назван' },
    notes: { type: 'string', description: 'Уточнения, если они прозвучали' }
  },
  required: ['title', 'project', 'assignee', 'due', 'notes'],
  additionalProperties: false
};

function extractionPrompt({ text, projects, people, today }) {
  return [
    'Разбери надиктованную задачу на поля. Отвечай только данными из текста, ничего не выдумывай.',
    `Сегодня ${today} — относительные сроки («завтра», «в пятницу», «через неделю») переведи в дату.`,
    `Известные проекты: ${projects.join(' | ') || 'нет'}.`,
    `Известные сотрудники: ${people.join(' | ') || 'нет'}.`,
    'Проект и исполнителя выбирай из этих списков, если узнаёшь их в тексте; иначе оставь пустую строку.',
    '',
    `Текст: ${text}`
  ].join('\n');
}

async function extractWithClaude(key, params) {
  const client = new Anthropic({ apiKey: key });

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2000,
    output_config: { format: { type: 'json_schema', schema: TASK_SCHEMA } },
    messages: [{ role: 'user', content: extractionPrompt(params) }]
  });

  if (response.stop_reason === 'refusal') throw new Error('Запрос отклонён моделью.');

  const block = response.content.find((b) => b.type === 'text');
  return JSON.parse(block.text);
}

async function extractWithOpenAi(key, params) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: extractionPrompt(params) }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'task', strict: true, schema: TASK_SCHEMA }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error ? data.error.message : 'Ошибка OpenAI');
  return JSON.parse(data.choices[0].message.content);
}

// Речь в текст умеет только OpenAI: у Claude нет приёма аудио через API.
async function transcribe(key, buffer) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/webm' }), 'voice.webm');
  form.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error ? data.error.message : 'Ошибка распознавания');
  return data.text;
}

/* ---------- Окно ---------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#f6f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

const send = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
};

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  migrateFromOldFolder(userData);

  configFile = path.join(userData, 'config.json');
  aiFile = path.join(userData, 'ai.json');
  legacyDataFile = path.join(userData, 'data.json');

  ipcMain.handle('config:load', () => readJson(configFile, {}));
  ipcMain.handle('config:save', (_e, config) => {
    writeJson(configFile, config);
    return true;
  });

  // Наружу отдаём только провайдера и признак «ключ задан», сам ключ не выдаём.
  ipcMain.handle('ai:status', () => {
    const ai = loadAi();
    return { provider: ai.provider, hasKey: Boolean(ai.key) };
  });
  ipcMain.handle('ai:save', (_e, { provider, key }) => {
    const current = loadAi();
    writeJson(aiFile, { provider, key: key || current.key });
    return true;
  });
  ipcMain.handle('ai:forget', () => {
    writeJson(aiFile, { provider: loadAi().provider, key: '' });
    return true;
  });

  ipcMain.handle('ai:transcribe', async (_e, buffer) => {
    const ai = loadAi();
    if (!ai.key) throw new Error('Не задан ключ.');
    if (ai.provider !== 'openai') {
      throw new Error('Голосовой ввод работает только с ChatGPT: у Claude нет распознавания речи.');
    }
    return transcribe(ai.key, Buffer.from(buffer));
  });

  ipcMain.handle('ai:extract', async (_e, params) => {
    const ai = loadAi();
    if (!ai.key) throw new Error('Не задан ключ.');
    return ai.provider === 'openai'
      ? extractWithOpenAi(ai.key, params)
      : extractWithClaude(ai.key, params);
  });

  ipcMain.handle('legacy:load', () => {
    if (!fs.existsSync(legacyDataFile)) return null;
    return readJson(legacyDataFile, null);
  });
  ipcMain.handle('legacy:archive', () => {
    if (!fs.existsSync(legacyDataFile)) return false;
    fs.renameSync(legacyDataFile, legacyDataFile + '.imported');
    return true;
  });

  ipcMain.handle('app:openExternal', (_e, url) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });

  /* ---------- Обновления ---------- */

  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates().catch(() => null));
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());

  autoUpdater.autoDownload = true;
  autoUpdater.on('update-available', (info) => send('update:available', info.version));
  autoUpdater.on('download-progress', (p) => send('update:progress', Math.round(p.percent)));
  autoUpdater.on('update-downloaded', (info) => send('update:ready', info.version));
  autoUpdater.on('error', () => send('update:error'));

  createWindow();

  // Проверяем при запуске и раз в шесть часов, если приложение не закрывают.
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => null);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => null), 6 * 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
