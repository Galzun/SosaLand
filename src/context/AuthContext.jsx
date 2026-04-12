// context/AuthContext.jsx
// Глобальный контекст аутентификации.
//
// Предоставляет всем компонентам:
//   - user         — данные текущего пользователя (или null)
//   - token        — JWT-токен (или null)
//   - loading      — идёт ли проверка токена при загрузке
//   - login()      — войти в аккаунт
//   - register()   — зарегистрироваться
//   - logout()     — выйти из аккаунта
//   - updateUser() — обновить данные пользователя в контексте (после редактирования профиля)
//
// Использование в компоненте:
//   const { user, login, logout, updateUser } = useAuth();

import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Создаём контекст с начальным значением null.
// null — потому что до проверки токена мы не знаем, авторизован ли пользователь.
const AuthContext = createContext(null);

// Ключ для хранения токена в localStorage браузера.
// localStorage сохраняет данные между сессиями (перезагрузками страницы).
const TOKEN_KEY = 'sosaland_token';

/**
 * AuthProvider — компонент-обёртка, который предоставляет AuthContext.
 * Оборачивает всё приложение в App.jsx.
 */
export function AuthProvider({ children }) {
  // user — объект пользователя { id, username, minecraftUuid, role } или null.
  const [user, setUser] = useState(null);

  // token — строка JWT или null.
  const [token, setToken] = useState(null);

  // loading — true пока проверяем сохранённый токен при первой загрузке страницы.
  // Нужен чтобы не показывать UI "не авторизован" раньше времени.
  const [loading, setLoading] = useState(true);

  // При первом монтировании компонента проверяем, есть ли сохранённый токен.
  // useEffect с пустым массивом [] запускается один раз — как componentDidMount.
  useEffect(() => {
    checkAuth();
  }, []);

/**
   * checkAuth — проверяет сохранённый токен при загрузке страницы.
   * Если токен валиден — восстанавливает сессию.
   * Если нет — очищает устаревшие данные.
   */
  async function checkAuth() {
    const savedToken = localStorage.getItem(TOKEN_KEY);

    if (!savedToken) {
      // Токена нет — пользователь не авторизован.
      setLoading(false);
      return;
    }

    try {
      // Отправляем токен на бэкенд для проверки.
      // GET /api/auth/me вернёт данные пользователя или 401 если токен невалиден.
      const response = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedToken}` },
      });

      // Токен валиден — восстанавливаем сессию.
      setToken(savedToken);
      setUser(response.data);
    } catch {
      // Токен просрочен или невалиден — очищаем.
      localStorage.removeItem(TOKEN_KEY);
    } finally {
      // В любом случае снимаем флаг загрузки.
      setLoading(false);
    }
  }

  /**
   * login — выполняет вход по логину и паролю.
   *
   * @param {string} username — логин пользователя
   * @param {string} password — пароль
   * @returns {Promise<void>}
   * @throws {Error} — если логин или пароль неверны (сообщение из бэкенда)
   */
  async function login(username, password) {
    // axios.post отправляет POST-запрос с JSON-телом.
    // Прокси в vite.config.js перенаправит /api/... → http://localhost:3001/api/...
    const response = await axios.post('/api/auth/login', { username, password });

    const { token: newToken, user: newUser } = response.data;

    // Сохраняем токен в localStorage — он переживёт перезагрузку страницы.
    localStorage.setItem(TOKEN_KEY, newToken);

    // Обновляем state — компоненты, использующие useAuth(), перерисуются.
    setToken(newToken);
    setUser(newUser);
  }

  /**
   * register — регистрирует нового пользователя.
   *
   * @param {string} username      — логин на сайте
   * @param {string} password      — пароль
   * @param {string} minecraftUuid — UUID Minecraft-аккаунта
   * @param {string} minecraftName — ник в Minecraft (необязателен)
   * @returns {Promise<void>}
   * @throws {Error} — если пользователь уже существует или данные некорректны
   */
  async function register(username, password, minecraftUuid, minecraftName) {
    const response = await axios.post('/api/auth/register', {
      username,
      password,
      minecraftUuid,
      minecraftName,
    });

    const { token: newToken, user: newUser } = response.data;

    // После успешной регистрации сразу авторизуем пользователя.
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  /**
   * logout — выходит из аккаунта.
   * Очищает токен и данные пользователя.
   */
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  /**
   * updateUser — обновляет данные пользователя в контексте.
   * Вызывается после успешного редактирования профиля,
   * чтобы все компоненты сразу увидели новые данные (аватар, имя и т.д.)
   *
   * @param {Object} updatedFields — поля для обновления (частичный объект)
   * Например: updateUser({ coverUrl: '/uploads/...', bio: 'Привет!' })
   */
  function updateUser(updatedFields) {
    // Объединяем текущие данные с обновлёнными.
    // Оператор spread (...) позволяет обновить только нужные поля.
    setUser(prev => prev ? { ...prev, ...updatedFields } : prev);
  }

  // Объект, который будет доступен всем потребителям контекста через useAuth().
  const value = {
    user,        // данные пользователя или null
    token,       // JWT-токен или null
    loading,     // true пока идёт начальная проверка
    login,
    register,
    logout,
    updateUser,  // обновить поля пользователя в контексте
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — кастомный хук для доступа к контексту авторизации.
 *
 * Пример использования:
 *   const { user, login, logout, updateUser } = useAuth();
 */
export function useAuth() {
  const context = useContext(AuthContext);

  // Если useAuth вызван вне AuthProvider — это ошибка разработчика.
  if (context === null) {
    throw new Error('useAuth должен использоваться внутри AuthProvider');
  }

  return context;
}
