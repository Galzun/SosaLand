// Components/ReactionsBar/ReactionsBar.jsx
// Панель реакций эмодзи — универсальный компонент для постов, новостей,
// событий и комментариев.
//
// Props:
//   targetType  — 'post' | 'news' | 'event' | 'comment'
//   targetId    — ID объекта
//   cssVars     — CSS-переменные --cards-* (опционально, для профиля)

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './ReactionsBar.scss';

export const REACTION_EMOJIS = ['❤️', '😊', '😂', '😍', '😭', '🤯', '👎', '💩', '🤡'];

function ReactionsBar({ targetType, targetId, cssVars }) {
  const { user, token } = useAuth();

  // [{emoji, count, userReacted}]
  const [reactions,   setReactions]   = useState([]);
  const [pickerOpen,  setPickerOpen]  = useState(false);
  const [toggling,    setToggling]    = useState(null); // emoji на паузе (debounce)

  const pickerRef = useRef(null);
  const addBtnRef = useRef(null);

  // -------------------------------------------------------------------------
  // Загрузка реакций
  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!targetId) return;
    try {
      const { data } = await axios.get(
        `/api/reactions?targetType=${targetType}&targetId=${targetId}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );
      setReactions(data.reactions || []);
    } catch {
      // не критично
    }
  }, [targetType, targetId, token]);

  useEffect(() => { load(); }, [load]);

  // Закрытие пикера при клике вне
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (
        pickerRef.current  && !pickerRef.current.contains(e.target) &&
        addBtnRef.current  && !addBtnRef.current.contains(e.target)
      ) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  // -------------------------------------------------------------------------
  // Toggle реакции
  // -------------------------------------------------------------------------
  const toggle = async (emoji) => {
    if (!user || toggling === emoji) return;

    // Оптимистичное обновление
    setReactions(prev => {
      const existing = prev.find(r => r.emoji === emoji);
      if (existing) {
        if (existing.userReacted) {
          const newCount = existing.count - 1;
          if (newCount === 0) return prev.filter(r => r.emoji !== emoji);
          return prev.map(r => r.emoji === emoji
            ? { ...r, count: newCount, userReacted: false } : r);
        } else {
          return prev.map(r => r.emoji === emoji
            ? { ...r, count: r.count + 1, userReacted: true } : r);
        }
      }
      return [...prev, { emoji, count: 1, userReacted: true }];
    });

    setToggling(emoji);
    try {
      await axios.post(
        '/api/reactions/toggle',
        { emoji, targetType, targetId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      load(); // откат при ошибке
    } finally {
      setToggling(null);
    }
  };

  const handlePickerEmoji = (emoji) => {
    toggle(emoji);
    setPickerOpen(false);
  };

  // Сортируем: сначала те, на которые пользователь реагировал, потом по убыванию счётчика
  const sorted = [...reactions].sort((a, b) => {
    if (a.userReacted !== b.userReacted) return (b.userReacted ? 1 : 0) - (a.userReacted ? 1 : 0);
    return b.count - a.count;
  });

  const userReactedSet = new Set(reactions.filter(r => r.userReacted).map(r => r.emoji));

  const hasAny = sorted.length > 0;

  if (!hasAny && !user) return null;

  return (
    <div className="reactions-bar" style={cssVars}>
      {/* Кнопка добавить реакцию — всегда слева */}
      {user && (
        <div className="reactions-bar__add-wrap">
          <button
            ref={addBtnRef}
            className={`reactions-bar__add${pickerOpen ? ' reactions-bar__add--open' : ''}`}
            onClick={() => setPickerOpen(v => !v)}
            title="Добавить реакцию"
          >
            😊
          </button>

          {pickerOpen && (
            <div ref={pickerRef} className="reactions-bar__picker">
              {REACTION_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  className={`reactions-bar__picker-emoji${userReactedSet.has(emoji) ? ' reactions-bar__picker-emoji--active' : ''}`}
                  onClick={() => handlePickerEmoji(emoji)}
                  title={userReactedSet.has(emoji) ? 'Убрать' : 'Добавить'}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Реакции — справа от кнопки */}
      {sorted.map(r => (
        <button
          key={r.emoji}
          className={`reactions-bar__item${r.userReacted ? ' reactions-bar__item--active' : ''}`}
          onClick={() => toggle(r.emoji)}
          title={user
            ? (r.userReacted ? 'Убрать реакцию' : 'Добавить реакцию')
            : 'Войдите, чтобы реагировать'}
          disabled={toggling === r.emoji}
        >
          <span className="reactions-bar__emoji">{r.emoji}</span>
          <span className="reactions-bar__count">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

export default ReactionsBar;
