import { useState } from 'react';
import LoginForm from '../../Components/Auth/LoginForm';
import RegisterForm from '../../Components/Auth/RegisterForm';
import './AuthPage.scss';

function AuthPage() {
  const [mode, setMode] = useState('login');

  return (
    <div className="auth-page">
      <div className="auth-page__container">
        <div className="auth-page__tabs">
          <button
            className={`auth-page__tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            Вход
          </button>
          <button
            className={`auth-page__tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            Регистрация
          </button>
        </div>

        {mode === 'login' ? (
          <LoginForm onSwitchToRegister={() => setMode('register')} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setMode('login')} />
        )}
      </div>
    </div>
  );
}

export default AuthPage;