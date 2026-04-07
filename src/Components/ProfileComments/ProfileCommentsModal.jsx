// Components/ProfileComments/ProfileCommentsModal.jsx
// Модальное окно со всеми комментариями к профилю пользователя.
// Рендерится через createPortal в document.body (обходит stacking context).
//
// Props:
//   userId   — ID пользователя, чей профиль комментируется
//   username — ник, используется в заголовке
//   onClose  — callback для закрытия

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import CommentSection from '../CommentSection/CommentSection';
import './ProfileComments.scss';

function ProfileCommentsModal({ userId, username, onClose }) {
  // Блокируем скролл body пока модалка открыта
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Закрытие по Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div className="profile-comments-modal" onClick={onClose}>
      <div
        className="profile-comments-modal__content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="profile-comments-modal__header">
          <h3 className="profile-comments-modal__title">
            Комментарии к профилю {username}
          </h3>
          <button
            className="profile-comments-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Все комментарии через CommentSection с autoLoad */}
        <div className="profile-comments-modal__body">
          <CommentSection
            type="profile"
            id={userId}
            autoLoad={true}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ProfileCommentsModal;
