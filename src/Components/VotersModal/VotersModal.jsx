// Components/VotersModal/VotersModal.jsx
// Модальное окно: список проголосовавших за вариант(ы) опроса.
//
// Props:
//   pollId    — ID опроса
//   poll      — объект опроса (для названий вариантов)
//   mode      — 'option' (один вариант) | 'all' (все варианты)
//   optionId  — ID варианта (для mode='option')
//   onClose() — закрыть
//   cssVars   — CSS-переменные кастомизации

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './VotersModal.scss';

function VotersModal({ pollId, poll, mode, optionId, onClose, cssVars }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    axios.get(`/api/polls/${pollId}/voters`)
      .then(({ data }) => setData(data))
      .catch(() => setError('Не удалось загрузить данные'))
      .finally(() => setLoading(false));
  }, [pollId]);

  // Закрытие по Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const optionsMap = Object.fromEntries((poll.options || []).map(o => [o.id, o.text]));

  // Определяем, какие варианты показывать
  const targetOptionIds = mode === 'option'
    ? [optionId]
    : (poll.options || []).map(o => o.id);

  const modal = (
    <div className="voters-modal" style={cssVars} onClick={onClose}>
      <div className="voters-modal__box" onClick={e => e.stopPropagation()}>

        <div className="voters-modal__header">
          <span className="voters-modal__title">
            {mode === 'all' ? '📊 Результаты голосования' : '👥 Проголосовали'}
          </span>
          <button type="button" className="voters-modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="voters-modal__body">
          {loading && <p className="voters-modal__loading">Загрузка...</p>}
          {error   && <p className="voters-modal__error">{error}</p>}

          {data && !loading && (
            data.anonymous ? (
              // Анонимный опрос — только числа
              <div className="voters-modal__anon">
                <p className="voters-modal__anon-label">Анонимный опрос — имена скрыты</p>
                {targetOptionIds.map(oid => {
                  const count = data.counts?.find(c => c.option_id === oid)?.count || 0;
                  const pct = poll.totalVotes > 0 ? Math.round(count / poll.totalVotes * 100) : 0;
                  return (
                    <div key={oid} className="voters-modal__option-block">
                      <div className="voters-modal__option-name">{optionsMap[oid] || oid}</div>
                      <div className="voters-modal__option-stat">
                        <span>{count} гол.</span>
                        <span className="voters-modal__pct">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Публичный опрос — список пользователей
              <div className="voters-modal__sections">
                {targetOptionIds.map(oid => {
                  const voters = data.byOption?.[oid] || [];
                  if (mode === 'option' && voters.length === 0) {
                    return (
                      <div key={oid} className="voters-modal__empty">
                        Пока никто не голосовал за этот вариант
                      </div>
                    );
                  }
                  if (mode === 'all' && voters.length === 0) return null;

                  return (
                    <div key={oid} className="voters-modal__option-block">
                      {mode === 'all' && (
                        <div className="voters-modal__option-name">
                          {optionsMap[oid] || oid}
                          <span className="voters-modal__option-count">({voters.length})</span>
                        </div>
                      )}
                      <div className="voters-modal__voters-list">
                        {voters.map(v => (
                          <Link
                            key={v.id}
                            to={`/player/${v.username}`}
                            className="voters-modal__voter"
                            onClick={onClose}
                          >
                            <img
                              className="voters-modal__voter-avatar"
                              src={v.avatarUrl}
                              alt={v.username}
                            />
                            <span className="voters-modal__voter-name">{v.username}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default VotersModal;
