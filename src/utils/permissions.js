// src/utils/permissions.js
// Полный список кастомных прав для кастомных ролей (должен совпадать с backend/utils/permissions.js)

export const PERMISSIONS = [
  // ── Контент ────────────────────────────────────────────────────────────────
  { id: 'manage_news',   label: 'Редактировать новости', group: 'Контент' },
  { id: 'manage_events', label: 'Редактировать события', group: 'Контент' },

  // ── Модерация ───────────────────────────────────────────────────────────────
  { id: 'ban_users',        label: 'Банить/разбанить игроков',                      group: 'Модерация' },
  { id: 'manage_tickets',   label: 'Управлять заявками на регистрацию',           group: 'Модерация' },
  { id: 'moderate_content', label: 'Удалять чужой контент (посты/комменты/медиа)', group: 'Модерация' },
  { id: 'manage_court',     label: 'Рассматривать жалобы в Суде',                  group: 'Модерация' },

  // ── Администрирование ───────────────────────────────────────────────────────
  { id: 'assign_custom_roles',  label: 'Назначать кастомные роли игрокам',    group: 'Администрирование' },
  { id: 'manage_user_accounts', label: 'Управлять аккаунтами пользователей', group: 'Администрирование' },
  { id: 'view_logs',            label: 'Просматривать логи активности',       group: 'Администрирование' },
  { id: 'manage_custom_roles',  label: 'Управлять кастомными ролями (CRUD)',  group: 'Администрирование' },
];

// Сгруппированный вид
export const PERMISSIONS_BY_GROUP = PERMISSIONS.reduce((acc, p) => {
  if (!acc[p.group]) acc[p.group] = [];
  acc[p.group].push(p);
  return acc;
}, {});
