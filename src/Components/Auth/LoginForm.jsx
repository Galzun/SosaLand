// Components/Auth/LoginForm.jsx
// Форма входа в аккаунт.
// Вызывает login() из AuthContext, обрабатывает ошибки, редиректит на главную.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Auth.scss';

function LoginForm({ onSwitchToRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');    // текст ошибки или пустая строка
  const [isLoading, setIsLoading] = useState(false); // блокируем кнопку пока идёт запрос

  // useAuth() — кастомный хук, читает AuthContext.
  // login() отправит запрос на бэкенд и сохранит токен.
  const { login } = useAuth();

  // useNavigate — хук React Router для программного перехода между страницами.
  // navigate('/') заменяет window.location.href, но без полной перезагрузки страницы.
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault(); // отменяем стандартное поведение формы (перезагрузку страницы)

    if (!username.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }

    setIsLoading(true);
    setError(''); // сбрасываем предыдущую ошибку перед новым запросом

    try {
      // login() бросает исключение при ошибке (неверный пароль, сервер недоступен).
      await login(username.trim(), password);

      // Успех — перенаправляем на главную страницу.
      navigate('/');
    } catch (err) {
      // axios оборачивает HTTP-ошибки в err.response.
      // err.response.data.error — сообщение из бэкенда (например: "Неверный логин или пароль").
      // Если err.response нет — значит сервер недоступен (сетевая ошибка).
      const message = err.response?.data?.error || 'Не удалось подключиться к серверу';
      setError(message);
    } finally {
      // finally выполняется всегда — и при успехе, и при ошибке.
      setIsLoading(false);
    }
  };

  return (
    // noValidate отключает встроенную браузерную валидацию — используем свою.
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2>Вход</h2>

      <div className="auth-form__field">
        <label>Логин</label>
        <input
          type="text"
          placeholder="Ваш логин"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(''); // убираем ошибку при вводе
          }}
          autoFocus
          disabled={isLoading}
        />
      </div>

      <div className="auth-form__field">
        <label>Пароль</label>
        <input
          type="password"
          placeholder="Ваш пароль"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError('');
          }}
          disabled={isLoading}
        />
      </div>

      {/* Показываем ошибку если она есть */}
      {error && (
        <div className="auth-form__error auth-form__error--block">{error}</div>
      )}

      <button
        type="submit"
        className="auth-form__submit"
        disabled={isLoading}
      >
        {/* Показываем "Вхожу..." пока идёт запрос — это называется optimistic UI */}
        {isLoading ? 'Вхожу...' : 'Войти'}
      </button>

      <button
        type="button"
        onClick={onSwitchToRegister}
        className="auth-form__switch"
        disabled={isLoading}
      >
        Нет аккаунта? Зарегистрироваться
      </button>
    </form>
  );
}

export default LoginForm;
