import './Auth.scss';

function LoginForm({ onSwitchToRegister }) {
  return (
    <div className="auth-form">
      <h2>Вход</h2>
      
      <div className="auth-form__field">
        <label>Логин</label>
        <input type="text" placeholder="Ваш логин" />
      </div>
      
      <div className="auth-form__field">
        <label>Пароль</label>
        <input type="password" placeholder="Ваш пароль" />
      </div>
      
      <button className="auth-form__submit">
        Войти
      </button>
      
      <button
        type="button"
        onClick={onSwitchToRegister}
        className="auth-form__switch"
      >
        Нет аккаунта? Зарегистрироваться
      </button>
    </div>
  );
}

export default LoginForm;