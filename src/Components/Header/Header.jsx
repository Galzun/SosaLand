import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../../context/PlayerContext';
import './Header.scss';

function Header({ serverIp, borderColor }) {
  const [copied, setCopied] = useState(false);
  const { onlineCount } = usePlayer();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(serverIp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      console.log('IP скопирован:', serverIp);
    } catch (err) {
      console.error('Ошибка копирования:', err);
    }
  };

  return (
    <header className="header" style={{ borderBottomColor: borderColor }}>
      <div className="header__container">
        <Link to="/" className="header__logo">
          <div className="header__logo-icon">
            <span className="header__logo-block">⬜</span>
            <span className="header__logo-block">🟫</span>
            <span className="header__logo-block">🟩</span>
          </div>
          <span className="header__title">Sosaland</span>
        </Link>

        <div className="header__info">
          <div className="header__badge">
            <span className="header__badge-dot" style={{ backgroundColor: borderColor }}></span>
            <span className="header__badge-text">Онлайн: {onlineCount}</span>
          </div>
          
          <a href='https://sosaland.gitbook.io/sosaland' target='_blank' rel="noopener noreferrer" className="header__badge header__badge--version">
            <span className="header__badge-icon">📑</span>
            <span className="header__badge-text">Wiki</span>
          </a>
          
          <div 
            className={copied ? "header__badge header__badge--ip_copy" : "header__badge header__badge--ip"}
            onClick={copyToClipboard}
            title="Нажмите, чтобы скопировать IP">
            <span className="header__badge-icon">🌐</span>
            <span className="header__badge-text">
              {copied ? "IP Скопирован!" : serverIp}
            </span>
          </div>
          <Link to="/auth" className="header__badge header__badge--login">
            <span className="header__badge-icon">👤</span>
            <span className="header__badge-text">Войти</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Header;