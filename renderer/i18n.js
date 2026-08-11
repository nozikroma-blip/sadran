'use strict';

/**
 * Переводы интерфейса. Ключи одинаковые во всех языках; если перевода нет,
 * подставляется русский, а не пустая строка.
 *
 * В строках допустимы подстановки вида {name} — см. функцию t().
 */

const LANGUAGES = [
  { id: 'ru', label: 'Русский',  locale: 'ru-RU', dir: 'ltr' },
  { id: 'en', label: 'English',  locale: 'en-US', dir: 'ltr' },
  { id: 'he', label: 'עברית',    locale: 'he-IL', dir: 'rtl' }
];

const TRANSLATIONS = {

  /* ================= Русский ================= */
  ru: {
    lang: { label: 'Язык' },

    setup: {
      title: 'Подключение к команде',
      lead: 'Введите адрес и ключ вашего проекта Supabase. Их выдаёт сам Supabase в разделе Project Settings → API. Одни и те же значения нужно ввести на компьютере каждого участника.',
      url: 'Project URL',
      key: 'Anon public key',
      hint: 'Ключ «anon public» — не секретный, он предназначен для клиентских приложений. Ключ «service_role» сюда вводить не нужно.',
      connect: 'Подключиться',
      badUrl: 'Адрес должен начинаться с https:// — скопируйте его из Project Settings → API.'
    },

    auth: {
      signIn: 'Вход',
      signUp: 'Регистрация',
      doSignIn: 'Войти',
      doSignUp: 'Зарегистрироваться',
      toSignUp: 'Нет аккаунта? Зарегистрироваться',
      toSignIn: 'Уже есть аккаунт? Войти',
      name: 'Имя и фамилия',
      namePlaceholder: 'Иван Петров',
      email: 'Почта',
      password: 'Пароль',
      changeServer: 'Подключиться к другой базе',
      confirmMail: 'Аккаунт создан. Подтвердите почту по ссылке из письма, затем войдите.',
      expired: 'Сессия истекла, войдите заново.'
    },

    view: { asOwner: 'Все команды', asMember: 'Только моя команда' },

    ai: {
      title: 'Помощник по задачам',
      lead: 'Подключите свой аккаунт Claude или ChatGPT — и задачу можно будет надиктовать голосом: помощник разберёт её на проект, исполнителя и срок, а вы проверите и подтвердите.',
      provider: 'Сервис',
      key: 'Ключ доступа (API key)',
      keyPlaceholder: 'вставьте ключ',
      note: 'Ключ хранится только на этом компьютере и в общую базу не попадает — команда и владелец базы его не увидят. Оплата идёт по вашему тарифу у выбранного сервиса.',
      forget: 'Удалить ключ',
      claude: 'Claude (Anthropic)',
      openai: 'ChatGPT (OpenAI)',
      notSet: 'Помощник не подключён. Откройте «Помощник» внизу слева.',
      voiceNeedsOpenAi: 'Распознавание речи есть только у ChatGPT — у Claude нет приёма аудио. Выберите ChatGPT или введите задачу текстом.',
      listening: 'Идёт запись… нажмите ещё раз, чтобы остановить.',
      thinking: 'Разбираю сказанное…',
      nothingHeard: 'Ничего не распознано — попробуйте ещё раз.',
      checkTask: 'Проверьте, что помощник понял правильно, и сохраните.',
      failed: 'Помощник не справился: {error}'
    },

    update: {
      available: 'Есть новая версия {version} — скачиваю…',
      ready: 'Версия {version} загружена.',
      install: 'Перезапустить и обновить'
    },

    nav: {
      viewMode: 'Показывать',
      assistant: 'Помощник',
      pair: 'Подключить помощника',
      pairTitle: 'Код подключения',
      pairText: 'Введите этот код на странице подключения в Claude. Код действует 5 минут и только один раз.',
      pairFailed: 'Не удалось выдать код: {error}',
      myTasks: 'Мои задачи',
      findProject: 'Найти проект…',
      team: 'Команда',
      projects: 'Проекты',
      newProject: '+ Новый проект',
      sortManual: 'Порядок: свой',
      sortCode: 'Порядок: по номеру',
      sortName: 'Порядок: по названию',
      sortHint: 'Порядок проектов виден только вам. Проекты можно перетаскивать мышью.',
      changeName: 'Сменить имя',
      signOut: 'Выйти',
      syncOn: 'Синхронизация включена',
      syncOff: 'Нет связи с базой'
    },

    head: {
      teams: 'Команды',
      myTeam: 'Моя команда',
      noProjects: 'Нет проектов',
      addTeam: '+ Команда',
      addTask: '+ Задача',
      voice: '🎤 Голосом',
      rename: 'Переименовать',
      deleteProject: 'Удалить проект',
      teamsMeta: 'Команд: {teams} · сотрудников: {people}',
      teamMeta: '{team} · вы {role}',
      noTeam: 'Вы пока не в команде',
      assignedToYou: 'Назначено на вас: {total}',
      inProgress: 'в работе: {open}',
      overdue: 'просрочено: {overdue}',
      tasksTotal: 'Задач: {total}',
      doneCount: 'выполнено: {done}'
    },

    filters: {
      search: 'Поиск по задачам…',
      allStatuses: 'Все статусы',
      allAssignees: 'Все исполнители',
      noAssignee: 'Без исполнителя',
      overdueOnly: 'Только просроченные',
      hideDone: 'Скрыть выполненные'
    },

    status: {
      todo: 'К работе',
      progress: 'В работе',
      stuck: 'Застряло',
      done: 'Готово'
    },

    role: {
      owner: 'владелец',
      leader: 'лидер команды',
      member: 'сотрудник'
    },

    table: {
      task: 'Задача',
      project: 'Проект',
      status: 'Статус',
      due: 'Дедлайн',
      assignee: 'Исполнитель',
      addTask: '+ Добавить задачу',
      edit: 'Изм.',
      delete: 'Удал.',
      you: 'вы',
      unassigned: 'не назначен',
      noMatch: 'Под фильтры ничего не подходит.',
      empty: 'В проекте пока нет задач.',
      nothingAssigned: 'На вас пока ничего не назначено.',
      noProjectsYet: 'Проектов пока нет.',
      createFirst: 'Создать первый проект',
      leaderCreates: 'В вашей команде пока нет проектов — их заводит лидер.',
      notInTeamYet: 'Вас пока не добавили в команду — проекты появятся после этого.'
    },

    due: {
      today: 'сегодня',
      tomorrow: 'завтра',
      yesterday: 'вчера',
      overdueBy: 'просрочено на {days} дн.',
      inDays: 'через {days} дн.',
      minDate: 'Дедлайн не может быть раньше сегодняшнего дня.'
    },

    group: {
      overdue: 'Просрочено',
      today: 'Сегодня',
      week: 'Ближайшая неделя',
      later: 'Позже',
      noDue: 'Без срока',
      noTeam: 'Без команды'
    },

    team: {
      leader: 'Лидер: {name} · проектов: {count}',
      noLeader: 'не назначен',
      empty: 'В команде пока никого нет.',
      addPerson: 'Добавить человека',
      setLeader: 'Назначить лидера',
      rename: 'Переименовать',
      delete: 'Удалить',
      remove: 'Убрать',
      busy: 'задач в работе: {count}',
      free: 'свободен',
      noTeams: 'Команд пока нет. Создайте первую и назначьте лидера.',
      notInTeam: 'Вас пока не добавили в команду. Обратитесь к лидеру — он найдёт вас по почте.',
      create: 'Создать команду',
      allTaken: 'Все зарегистрированные уже состоят в командах. Новый человек появится здесь после регистрации.',
      needMembers: 'Сначала добавьте в команду людей — лидера выбирают из её состава.',
      exists: 'Команда «{name}» уже есть.'
    },

    dialog: {
      save: 'Сохранить',
      cancel: 'Отмена',
      newTask: 'Новая задача',
      task: 'Задача',
      title: 'Название',
      project: 'Проект',
      team: 'Команда',
      status: 'Статус',
      due: 'Дедлайн',
      assignee: 'Исполнитель',
      notes: 'Заметки',
      newProject: 'Новый проект',
      editProject: 'Изменить проект',
      code: 'Номер',
      codeHint: 'Номер можно оставить пустым — тогда в списке будет только название.',
      nameTaken: 'Название занято: проект «{name}» уже есть.',
      codeTaken: 'Номер {code} уже занят проектом «{name}».',
      deleteProject: 'Удалить проект?',
      deleteProjectText: '«{name}» и все его задачи ({count}) будут удалены у всей команды.',
      deleteTask: 'Удалить задачу?',
      deleteTaskText: '«{name}» будет удалена у всей команды.',
      whoAreYou: 'Как вас зовут',
      openTask: 'Открыть задачу',
      files: 'Файлы и скриншоты',
      attach: '+ Прикрепить файл',
      attachHint: 'до 25 МБ; изображения открываются прямо в приложении',
      comments: 'Обсуждение',
      commentPlaceholder: 'Написать комментарий…',
      send: 'Отправить',
      close: 'Закрыть',
      noComments: 'Комментариев пока нет.',
      noFiles: 'Файлов пока нет.',
      deleteFile: 'Удалить файл?',
      deleteFileText: '«{name}» будет удалён у всей команды.',
      newTeam: 'Новая команда',
      renameTeam: 'Переименовать команду',
      deleteTeam: 'Удалить команду?',
      deleteTeamText: '«{name}»: проектов — {projects} (удалятся вместе со всеми задачами), сотрудников — {members} (останутся, но без команды).',
      teamLeader: 'Лидер команды',
      whoLeads: 'Кто ведёт «{name}»',
      addToTeam: 'Добавить в команду',
      whoToAdd: 'Кого добавить',
      removeMember: 'Убрать из команды?',
      removeMemberBusy: '{name} останется без команды. Незакрытых задач на нём: {count} — они станут «не назначен».',
      removeMemberText: '{name} останется без команды и потеряет доступ к её проектам.'
    },

    legacy: {
      found: 'На этом компьютере остались данные прошлой версии: проектов — {projects}, задач — {tasks}.',
      import: 'Перенести в облако',
      done: 'Данные перенесены. Старый файл сохранён рядом с пометкой .imported.',
      failed: 'Не удалось перенести: {error}'
    },

    error: {
      unknown: 'Неизвестная ошибка',
      credentials: 'Неверная почта или пароль.',
      registered: 'Такой пользователь уже зарегистрирован — просто войдите.',
      notConfirmed: 'Почта не подтверждена. Откройте письмо от Supabase и перейдите по ссылке.',
      shortPassword: 'Пароль должен быть не короче 6 символов.',
      offline: 'Нет связи с базой. Проверьте интернет и адрес проекта Supabase.',
      badEmail: 'Такой адрес почты не принят. Supabase не разрешает выдуманные домены — введите настоящую почту.',
      signupsOff: 'Регистрация закрыта в настройках Supabase: Authentication → Sign In / Providers → Email → включите Allow new users to sign up.',
      emailOff: 'Вход по почте выключен в настройках Supabase: Authentication → Sign In / Providers → включите Email.',
      tooMany: 'Слишком много попыток подряд. Подождите минуту и попробуйте снова.',
      mailLimit: 'Превышен лимит писем от Supabase. Подождите или выключите подтверждение почты.',
      nameLong: 'Имя слишком длинное — не больше 20 символов.',
      projectNameTaken: 'Проект с таким названием уже создан — возможно, только что кем-то из команды.',
      projectCodeTaken: 'Проект с таким номером уже создан — возможно, только что кем-то из команды.',
      projectNameLong: 'Название проекта слишком длинное — не больше 80 символов.',
      projectCodeLong: 'Номер проекта слишком длинный — не больше 20 символов.',
      taskTitleLong: 'Название задачи слишком длинное — не больше 200 символов.',
      notesLong: 'Заметка слишком длинная — не больше 2000 символов.',
      needMigration12: 'База ещё не обновлена. Выполните supabase-migration-1.2.sql в SQL Editor.',
      needMigration20: 'База ещё не обновлена до команд. Выполните supabase-migration-2.0.sql в SQL Editor.',
      noRights: 'Недостаточно прав для этого действия.',
      noTables: 'В базе нет нужных таблиц. Выполните скрипт supabase-schema.sql в SQL Editor.'
    }
  },

  /* ================= English ================= */
  en: {
    lang: { label: 'Language' },

    setup: {
      title: 'Connect to your team',
      lead: 'Enter the URL and key of your Supabase project. You can find them in Project Settings → API. Everyone on the team enters the same two values.',
      url: 'Project URL',
      key: 'Anon public key',
      hint: 'The "anon public" key is not a secret — it is meant for client apps. Do not enter the "service_role" key here.',
      connect: 'Connect',
      badUrl: 'The URL must start with https:// — copy it from Project Settings → API.'
    },

    auth: {
      signIn: 'Sign in',
      signUp: 'Sign up',
      doSignIn: 'Sign in',
      doSignUp: 'Create account',
      toSignUp: 'No account? Sign up',
      toSignIn: 'Already have an account? Sign in',
      name: 'Full name',
      namePlaceholder: 'John Smith',
      email: 'Email',
      password: 'Password',
      changeServer: 'Connect to a different database',
      confirmMail: 'Account created. Confirm your email using the link we sent, then sign in.',
      expired: 'Your session has expired, please sign in again.'
    },

    view: { asOwner: 'All teams', asMember: 'My team only' },

    ai: {
      title: 'Task assistant',
      lead: 'Connect your own Claude or ChatGPT account and you can dictate a task out loud — the assistant fills in the project, assignee and due date, and you confirm.',
      provider: 'Service',
      key: 'API key',
      keyPlaceholder: 'paste your key',
      note: 'The key is stored only on this computer and never reaches the shared database — your team and the database owner cannot see it. Usage is billed on your own plan with that service.',
      forget: 'Delete key',
      claude: 'Claude (Anthropic)',
      openai: 'ChatGPT (OpenAI)',
      notSet: 'The assistant is not connected. Open "Assistant" at the bottom left.',
      voiceNeedsOpenAi: 'Only ChatGPT can transcribe speech — Claude has no audio input. Switch to ChatGPT, or type the task instead.',
      listening: 'Recording… click again to stop.',
      thinking: 'Working out what you said…',
      nothingHeard: 'Nothing was recognised — please try again.',
      checkTask: 'Check that the assistant got it right, then save.',
      failed: 'The assistant failed: {error}'
    },

    update: {
      available: 'Version {version} is available — downloading…',
      ready: 'Version {version} is downloaded.',
      install: 'Restart and update'
    },

    nav: {
      viewMode: 'Show',
      assistant: 'Assistant',
      pair: 'Connect assistant',
      pairTitle: 'Pairing code',
      pairText: 'Enter this code on the connection page in Claude. It is valid for 5 minutes and can be used once.',
      pairFailed: 'Could not issue a code: {error}',
      myTasks: 'My tasks',
      findProject: 'Find a project…',
      team: 'Team',
      projects: 'Projects',
      newProject: '+ New project',
      sortManual: 'Order: custom',
      sortCode: 'Order: by number',
      sortName: 'Order: by name',
      sortHint: 'Only you see this order. Projects can be dragged with the mouse.',
      changeName: 'Change name',
      signOut: 'Sign out',
      syncOn: 'Sync is on',
      syncOff: 'No connection to the database'
    },

    head: {
      teams: 'Teams',
      myTeam: 'My team',
      noProjects: 'No projects',
      addTeam: '+ Team',
      addTask: '+ Task',
      voice: '🎤 Dictate',
      rename: 'Rename',
      deleteProject: 'Delete project',
      teamsMeta: 'Teams: {teams} · people: {people}',
      teamMeta: '{team} · you are the {role}',
      noTeam: 'You are not on a team yet',
      assignedToYou: 'Assigned to you: {total}',
      inProgress: 'in progress: {open}',
      overdue: 'overdue: {overdue}',
      tasksTotal: 'Tasks: {total}',
      doneCount: 'done: {done}'
    },

    filters: {
      search: 'Search tasks…',
      allStatuses: 'All statuses',
      allAssignees: 'All assignees',
      noAssignee: 'Unassigned',
      overdueOnly: 'Overdue only',
      hideDone: 'Hide completed'
    },

    status: {
      todo: 'To do',
      progress: 'In progress',
      stuck: 'Stuck',
      done: 'Done'
    },

    role: {
      owner: 'owner',
      leader: 'team leader',
      member: 'member'
    },

    table: {
      task: 'Task',
      project: 'Project',
      status: 'Status',
      due: 'Due date',
      assignee: 'Assignee',
      addTask: '+ Add task',
      edit: 'Edit',
      delete: 'Delete',
      you: 'you',
      unassigned: 'unassigned',
      noMatch: 'Nothing matches the filters.',
      empty: 'No tasks in this project yet.',
      nothingAssigned: 'Nothing is assigned to you yet.',
      noProjectsYet: 'No projects yet.',
      createFirst: 'Create your first project',
      leaderCreates: 'Your team has no projects yet — the leader creates them.',
      notInTeamYet: 'You have not been added to a team yet — projects will appear after that.'
    },

    due: {
      today: 'today',
      tomorrow: 'tomorrow',
      yesterday: 'yesterday',
      overdueBy: '{days} days overdue',
      inDays: 'in {days} days',
      minDate: 'The due date cannot be earlier than today.'
    },

    group: {
      overdue: 'Overdue',
      today: 'Today',
      week: 'This week',
      later: 'Later',
      noDue: 'No due date',
      noTeam: 'Without a team'
    },

    team: {
      leader: 'Leader: {name} · projects: {count}',
      noLeader: 'not set',
      empty: 'Nobody on this team yet.',
      addPerson: 'Add person',
      setLeader: 'Set leader',
      rename: 'Rename',
      delete: 'Delete',
      remove: 'Remove',
      busy: 'tasks in progress: {count}',
      free: 'free',
      noTeams: 'No teams yet. Create the first one and set a leader.',
      notInTeam: 'You have not been added to a team yet. Ask your leader — they can find you by email.',
      create: 'Create team',
      allTaken: 'Everyone registered is already on a team. New people appear here after they sign up.',
      needMembers: 'Add people to the team first — the leader is chosen from its members.',
      exists: 'Team "{name}" already exists.'
    },

    dialog: {
      save: 'Save',
      cancel: 'Cancel',
      newTask: 'New task',
      task: 'Task',
      title: 'Title',
      project: 'Project',
      team: 'Team',
      status: 'Status',
      due: 'Due date',
      assignee: 'Assignee',
      notes: 'Notes',
      newProject: 'New project',
      editProject: 'Edit project',
      code: 'Number',
      codeHint: 'The number is optional — leave it empty to show the name alone.',
      nameTaken: 'Name is taken: project "{name}" already exists.',
      codeTaken: 'Number {code} already belongs to project "{name}".',
      deleteProject: 'Delete project?',
      deleteProjectText: '"{name}" and all of its tasks ({count}) will be deleted for the whole team.',
      deleteTask: 'Delete task?',
      deleteTaskText: '"{name}" will be deleted for the whole team.',
      whoAreYou: 'What is your name',
      openTask: 'Open task',
      files: 'Files and screenshots',
      attach: '+ Attach file',
      attachHint: 'up to 25 MB; images open inside the app',
      comments: 'Discussion',
      commentPlaceholder: 'Write a comment…',
      send: 'Send',
      close: 'Close',
      noComments: 'No comments yet.',
      noFiles: 'No files yet.',
      deleteFile: 'Delete file?',
      deleteFileText: '"{name}" will be deleted for the whole team.',
      newTeam: 'New team',
      renameTeam: 'Rename team',
      deleteTeam: 'Delete team?',
      deleteTeamText: '"{name}": projects — {projects} (deleted along with all their tasks), people — {members} (they stay, but without a team).',
      teamLeader: 'Team leader',
      whoLeads: 'Who leads "{name}"',
      addToTeam: 'Add to team',
      whoToAdd: 'Who to add',
      removeMember: 'Remove from team?',
      removeMemberBusy: '{name} will be left without a team. Open tasks assigned to them: {count} — they will become unassigned.',
      removeMemberText: '{name} will be left without a team and will lose access to its projects.'
    },

    legacy: {
      found: 'Data from the previous version is still on this computer: projects — {projects}, tasks — {tasks}.',
      import: 'Move to the cloud',
      done: 'Data moved. The old file was kept next to it with an .imported suffix.',
      failed: 'Could not move the data: {error}'
    },

    error: {
      unknown: 'Unknown error',
      credentials: 'Wrong email or password.',
      registered: 'This user is already registered — just sign in.',
      notConfirmed: 'Email is not confirmed. Open the message from Supabase and follow the link.',
      shortPassword: 'The password must be at least 6 characters.',
      offline: 'No connection to the database. Check your internet and the Supabase project URL.',
      badEmail: 'This email address was rejected. Supabase does not allow made-up domains — use a real address.',
      signupsOff: 'Sign-ups are disabled in Supabase: Authentication → Sign In / Providers → Email → enable "Allow new users to sign up".',
      emailOff: 'Email sign-in is disabled in Supabase: Authentication → Sign In / Providers → enable Email.',
      tooMany: 'Too many attempts in a row. Wait a minute and try again.',
      mailLimit: 'Supabase email limit reached. Wait, or turn off email confirmation.',
      nameLong: 'The name is too long — 20 characters maximum.',
      projectNameTaken: 'A project with this name already exists — possibly just created by a teammate.',
      projectCodeTaken: 'A project with this number already exists — possibly just created by a teammate.',
      projectNameLong: 'The project name is too long — 80 characters maximum.',
      projectCodeLong: 'The project number is too long — 20 characters maximum.',
      taskTitleLong: 'The task title is too long — 200 characters maximum.',
      notesLong: 'The note is too long — 2000 characters maximum.',
      needMigration12: 'The database is out of date. Run supabase-migration-1.2.sql in the SQL Editor.',
      needMigration20: 'The database does not support teams yet. Run supabase-migration-2.0.sql in the SQL Editor.',
      noRights: 'You do not have permission for this action.',
      noTables: 'The database has no required tables. Run supabase-schema.sql in the SQL Editor.'
    }
  },

  /* ================= עברית ================= */
  he: {
    lang: { label: 'שפה' },

    setup: {
      title: 'התחברות לצוות',
      lead: 'הזינו את הכתובת והמפתח של פרויקט Supabase שלכם. אפשר למצוא אותם ב־Project Settings ← API. כל אחד בצוות מזין את אותם שני ערכים.',
      url: 'Project URL',
      key: 'Anon public key',
      hint: 'המפתח «anon public» אינו סודי, הוא מיועד ליישומי לקוח. אין להזין כאן את המפתח «service_role».',
      connect: 'התחברות',
      badUrl: 'הכתובת חייבת להתחיל ב־https:// — העתיקו אותה מ־Project Settings ← API.'
    },

    auth: {
      signIn: 'כניסה',
      signUp: 'הרשמה',
      doSignIn: 'כניסה',
      doSignUp: 'יצירת חשבון',
      toSignUp: 'אין חשבון? הרשמה',
      toSignIn: 'כבר יש חשבון? כניסה',
      name: 'שם מלא',
      namePlaceholder: 'ישראל ישראלי',
      email: 'דוא״ל',
      password: 'סיסמה',
      changeServer: 'התחברות למסד נתונים אחר',
      confirmMail: 'החשבון נוצר. אשרו את הדוא״ל דרך הקישור שנשלח, ואז היכנסו.',
      expired: 'תוקף החיבור פג, היכנסו מחדש.'
    },

    view: { asOwner: 'כל הצוותים', asMember: 'הצוות שלי בלבד' },

    ai: {
      title: 'עוזר משימות',
      lead: 'חברו חשבון Claude או ChatGPT משלכם ותוכלו להכתיב משימה בקול — העוזר ימלא פרויקט, מבצע ותאריך יעד, ואתם תאשרו.',
      provider: 'שירות',
      key: 'מפתח API',
      keyPlaceholder: 'הדביקו את המפתח',
      note: 'המפתח נשמר רק במחשב הזה ואינו מגיע למסד הנתונים המשותף — הצוות ובעלי המסד לא רואים אותו. החיוב מתבצע לפי התוכנית שלכם באותו שירות.',
      forget: 'מחיקת המפתח',
      claude: 'Claude (Anthropic)',
      openai: 'ChatGPT (OpenAI)',
      notSet: 'העוזר אינו מחובר. פתחו «עוזר» בתחתית הצד.',
      voiceNeedsOpenAi: 'רק ChatGPT מזהה דיבור — ל־Claude אין קלט אודיו. עברו ל־ChatGPT או הקלידו את המשימה.',
      listening: 'מקליט… לחצו שוב כדי לעצור.',
      thinking: 'מנתח את מה שנאמר…',
      nothingHeard: 'לא זוהה דבר — נסו שוב.',
      checkTask: 'בדקו שהעוזר הבין נכון ושמרו.',
      failed: 'העוזר נכשל: {error}'
    },

    update: {
      available: 'קיימת גרסה {version} — מוריד…',
      ready: 'גרסה {version} הורדה.',
      install: 'הפעלה מחדש ועדכון'
    },

    nav: {
      viewMode: 'תצוגה',
      assistant: 'עוזר',
      pair: 'חיבור העוזר',
      pairTitle: 'קוד חיבור',
      pairText: 'הזינו את הקוד בעמוד החיבור ב־Claude. הקוד תקף 5 דקות ולשימוש חד־פעמי.',
      pairFailed: 'לא ניתן להנפיק קוד: {error}',
      myTasks: 'המשימות שלי',
      findProject: 'חיפוש פרויקט…',
      team: 'צוות',
      projects: 'פרויקטים',
      newProject: '+ פרויקט חדש',
      sortManual: 'סדר: אישי',
      sortCode: 'סדר: לפי מספר',
      sortName: 'סדר: לפי שם',
      sortHint: 'הסדר גלוי רק לכם. אפשר לגרור פרויקטים בעכבר.',
      changeName: 'שינוי שם',
      signOut: 'יציאה',
      syncOn: 'הסנכרון פעיל',
      syncOff: 'אין קשר עם מסד הנתונים'
    },

    head: {
      teams: 'צוותים',
      myTeam: 'הצוות שלי',
      noProjects: 'אין פרויקטים',
      addTeam: '+ צוות',
      addTask: '+ משימה',
      voice: '🎤 הכתבה',
      rename: 'שינוי שם',
      deleteProject: 'מחיקת פרויקט',
      teamsMeta: 'צוותים: {teams} · אנשים: {people}',
      teamMeta: '{team} · אתם {role}',
      noTeam: 'עדיין אינכם בצוות',
      assignedToYou: 'הוקצו לכם: {total}',
      inProgress: 'בעבודה: {open}',
      overdue: 'באיחור: {overdue}',
      tasksTotal: 'משימות: {total}',
      doneCount: 'הושלמו: {done}'
    },

    filters: {
      search: 'חיפוש משימות…',
      allStatuses: 'כל הסטטוסים',
      allAssignees: 'כל המבצעים',
      noAssignee: 'ללא מבצע',
      overdueOnly: 'באיחור בלבד',
      hideDone: 'הסתרת שהושלמו'
    },

    status: {
      todo: 'לביצוע',
      progress: 'בעבודה',
      stuck: 'תקוע',
      done: 'הושלם'
    },

    role: {
      owner: 'בעלים',
      leader: 'ראש צוות',
      member: 'עובד'
    },

    table: {
      task: 'משימה',
      project: 'פרויקט',
      status: 'סטטוס',
      due: 'תאריך יעד',
      assignee: 'מבצע',
      addTask: '+ הוספת משימה',
      edit: 'עריכה',
      delete: 'מחיקה',
      you: 'אתם',
      unassigned: 'לא הוקצה',
      noMatch: 'אין תוצאות מתאימות לסינון.',
      empty: 'אין עדיין משימות בפרויקט.',
      nothingAssigned: 'עדיין לא הוקצתה לכם משימה.',
      noProjectsYet: 'אין עדיין פרויקטים.',
      createFirst: 'יצירת הפרויקט הראשון',
      leaderCreates: 'לצוות שלכם אין עדיין פרויקטים — ראש הצוות יוצר אותם.',
      notInTeamYet: 'עדיין לא צורפתם לצוות — הפרויקטים יופיעו לאחר מכן.'
    },

    due: {
      today: 'היום',
      tomorrow: 'מחר',
      yesterday: 'אתמול',
      overdueBy: 'באיחור של {days} ימים',
      inDays: 'בעוד {days} ימים',
      minDate: 'תאריך היעד אינו יכול להיות מוקדם מהיום.'
    },

    group: {
      overdue: 'באיחור',
      today: 'היום',
      week: 'השבוע הקרוב',
      later: 'בהמשך',
      noDue: 'ללא תאריך',
      noTeam: 'ללא צוות'
    },

    team: {
      leader: 'ראש צוות: {name} · פרויקטים: {count}',
      noLeader: 'לא הוגדר',
      empty: 'אין עדיין אף אחד בצוות.',
      addPerson: 'הוספת אדם',
      setLeader: 'מינוי ראש צוות',
      rename: 'שינוי שם',
      delete: 'מחיקה',
      remove: 'הסרה',
      busy: 'משימות בעבודה: {count}',
      free: 'פנוי',
      noTeams: 'אין עדיין צוותים. צרו את הראשון ומנו לו ראש צוות.',
      notInTeam: 'עדיין לא צורפתם לצוות. פנו לראש הצוות — הוא ימצא אתכם לפי הדוא״ל.',
      create: 'יצירת צוות',
      allTaken: 'כל הרשומים כבר משויכים לצוותים. אדם חדש יופיע כאן לאחר ההרשמה.',
      needMembers: 'קודם הוסיפו אנשים לצוות — ראש הצוות נבחר מתוכו.',
      exists: 'הצוות «{name}» כבר קיים.'
    },

    dialog: {
      save: 'שמירה',
      cancel: 'ביטול',
      newTask: 'משימה חדשה',
      task: 'משימה',
      title: 'שם',
      project: 'פרויקט',
      team: 'צוות',
      status: 'סטטוס',
      due: 'תאריך יעד',
      assignee: 'מבצע',
      notes: 'הערות',
      newProject: 'פרויקט חדש',
      editProject: 'עריכת פרויקט',
      code: 'מספר',
      codeHint: 'אפשר להשאיר את המספר ריק — אז ברשימה יוצג רק השם.',
      nameTaken: 'השם תפוס: הפרויקט «{name}» כבר קיים.',
      codeTaken: 'המספר {code} כבר שייך לפרויקט «{name}».',
      deleteProject: 'למחוק את הפרויקט?',
      deleteProjectText: '«{name}» וכל המשימות שבו ({count}) יימחקו עבור כל הצוות.',
      deleteTask: 'למחוק את המשימה?',
      deleteTaskText: '«{name}» תימחק עבור כל הצוות.',
      whoAreYou: 'מה שמכם',
      openTask: 'פתיחת המשימה',
      files: 'קבצים וצילומי מסך',
      attach: '+ צירוף קובץ',
      attachHint: 'עד 25 מ״ב; תמונות נפתחות בתוך האפליקציה',
      comments: 'דיון',
      commentPlaceholder: 'כתיבת תגובה…',
      send: 'שליחה',
      close: 'סגירה',
      noComments: 'אין עדיין תגובות.',
      noFiles: 'אין עדיין קבצים.',
      deleteFile: 'למחוק את הקובץ?',
      deleteFileText: '«{name}» יימחק עבור כל הצוות.',
      newTeam: 'צוות חדש',
      renameTeam: 'שינוי שם הצוות',
      deleteTeam: 'למחוק את הצוות?',
      deleteTeamText: '«{name}»: פרויקטים — {projects} (יימחקו יחד עם כל המשימות), אנשים — {members} (יישארו, אך ללא צוות).',
      teamLeader: 'ראש הצוות',
      whoLeads: 'מי מוביל את «{name}»',
      addToTeam: 'הוספה לצוות',
      whoToAdd: 'את מי להוסיף',
      removeMember: 'להסיר מהצוות?',
      removeMemberBusy: '{name} יישאר ללא צוות. משימות פתוחות עליו: {count} — הן יהפכו ללא מוקצות.',
      removeMemberText: '{name} יישאר ללא צוות ויאבד גישה לפרויקטים שלו.'
    },

    legacy: {
      found: 'במחשב הזה נשארו נתונים מהגרסה הקודמת: פרויקטים — {projects}, משימות — {tasks}.',
      import: 'העברה לענן',
      done: 'הנתונים הועברו. הקובץ הישן נשמר לצידם עם הסיומת ‎.imported.',
      failed: 'ההעברה נכשלה: {error}'
    },

    error: {
      unknown: 'שגיאה לא ידועה',
      credentials: 'דוא״ל או סיסמה שגויים.',
      registered: 'המשתמש כבר רשום — פשוט היכנסו.',
      notConfirmed: 'הדוא״ל לא אושר. פתחו את ההודעה מ־Supabase ולחצו על הקישור.',
      shortPassword: 'הסיסמה חייבת להיות באורך 6 תווים לפחות.',
      offline: 'אין קשר עם מסד הנתונים. בדקו את האינטרנט ואת כתובת פרויקט Supabase.',
      badEmail: 'כתובת הדוא״ל נדחתה. Supabase אינו מאפשר דומיינים מומצאים — הזינו כתובת אמיתית.',
      signupsOff: 'ההרשמה סגורה בהגדרות Supabase: Authentication ← Sign In / Providers ← Email ← הפעילו «Allow new users to sign up».',
      emailOff: 'כניסה בדוא״ל מכובה בהגדרות Supabase: Authentication ← Sign In / Providers ← הפעילו Email.',
      tooMany: 'יותר מדי ניסיונות ברצף. המתינו דקה ונסו שוב.',
      mailLimit: 'הוגבלה שליחת הדוא״ל מ־Supabase. המתינו או כבו את אישור הדוא״ל.',
      nameLong: 'השם ארוך מדי — עד 20 תווים.',
      projectNameTaken: 'פרויקט בשם הזה כבר קיים — ייתכן שנוצר זה עתה על ידי חבר צוות.',
      projectCodeTaken: 'פרויקט במספר הזה כבר קיים — ייתכן שנוצר זה עתה על ידי חבר צוות.',
      projectNameLong: 'שם הפרויקט ארוך מדי — עד 80 תווים.',
      projectCodeLong: 'מספר הפרויקט ארוך מדי — עד 20 תווים.',
      taskTitleLong: 'שם המשימה ארוך מדי — עד 200 תווים.',
      notesLong: 'ההערה ארוכה מדי — עד 2000 תווים.',
      needMigration12: 'מסד הנתונים אינו מעודכן. הריצו את supabase-migration-1.2.sql ב־SQL Editor.',
      needMigration20: 'מסד הנתונים עדיין אינו תומך בצוותים. הריצו את supabase-migration-2.0.sql ב־SQL Editor.',
      noRights: 'אין לכם הרשאה לפעולה הזו.',
      noTables: 'במסד הנתונים חסרות הטבלאות הדרושות. הריצו את supabase-schema.sql ב־SQL Editor.'
    }
  }
};

/* ---------- Механика ---------- */

const LANG_KEY = 'app.lang';

function detectLanguage() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && TRANSLATIONS[saved]) return saved;

  // Язык системы: иврит и английский узнаём по коду, остальное — русский.
  const system = (navigator.language || 'ru').slice(0, 2).toLowerCase();
  if (system === 'he' || system === 'iw') return 'he';
  if (system === 'en') return 'en';
  return 'ru';
}

let currentLang = detectLanguage();

const langInfo = (id = currentLang) => LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];

function lookup(lang, path) {
  return path.split('.').reduce((node, key) => (node ? node[key] : undefined), TRANSLATIONS[lang]);
}

/**
 * t('dialog.deleteProjectText', { name: 'Савьон', count: 3 })
 * Если ключа нет в выбранном языке, берём русский — пустых надписей не будет.
 */
function t(path, params) {
  const value = lookup(currentLang, path) ?? lookup('ru', path) ?? path;
  if (!params) return value;

  return String(value).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

function setLanguage(id) {
  if (!TRANSLATIONS[id]) return;
  currentLang = id;
  localStorage.setItem(LANG_KEY, id);
  applyDirection();
}

function applyDirection() {
  const info = langInfo();
  document.documentElement.lang = info.id;
  document.documentElement.dir = info.dir;
}

// Подставляет переводы во всё, что размечено data-i18n в HTML.
function translateStatic(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-placeholder]')) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
}
