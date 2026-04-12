// Components/Auth/LoginForm.jsx
// Форма входа в аккаунт.
// Вызывает login() из AuthContext, обрабатывает ошибки, редиректит на главную.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Auth.scss';

function LoginForm({ onSwitchToRegister }) {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  // Подсказка появляется когда администратор сбросил пароль пользователя
  const [hint, setHint]           = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      const data = err.response?.data;
      if (data?.passwordReset) {
        // Пароль сброшен администратором — показываем подсказку
        setHint('Ваш пароль был сброшен администратором. Введите желаемый новый пароль.');
        setError(data.error || '');
      } else {
        const message = data?.error || 'Не удалось подключиться к серверу';
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2>Вход</h2>

      {hint && (
        <div className="auth-form__hint">{hint}</div>
      )}

      <div className="auth-form__field">
        <label>Логин</label>
        <input
          type="text"
          placeholder="Ваш логин"
          value={username}
          onChange={(e) => { setUsername(e.target.value); setError(''); }}
          autoFocus
          disabled={isLoading}
        />
      </div>

      <div className="auth-form__field">
        <label>{hint ? 'Новый пароль' : 'Пароль'}</label>
        <input
          type="password"
          placeholder={hint ? 'Минимум 6 символов' : 'Ваш пароль'}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="auth-form__error auth-form__error--block">{error}</div>
      )}

      <button
        type="submit"
        className="auth-form__submit"
        disabled={isLoading}
      >
        {isLoading ? 'Вхожу...' : hint ? 'Установить пароль и войти' : 'Войти'}
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
