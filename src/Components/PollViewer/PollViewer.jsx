// Components/PollViewer/PollViewer.jsx
// Отображение опроса с голосованием и результатами.
//
// Props:
//   pollId   — ID опроса (загружает сам)
//   cssVars  — CSS-переменные кастомизации (из PlayerPage)

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import VotersModal from '../VotersModal/VotersModal';
import PollBuilder from '../PollBuilder/PollBuilder';
import './PollViewer.scss';

const PAGE_SIZE = 5;

function PollViewer({ pollId, cssVars }) {
  const { user, token } = useAuth();
  const [poll,          setPoll]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [voting,        setVoting]        = useState(false);
  const [error,         setError]         = useState('');
  const [selected,      setSelected]      = useState([]); // выбранные option ids
  const [showAll,       setShowAll]       = useState(false);
  const [addingOption,  setAddingOption]  = useState(false);
  const [newOptionText, setNewOptionText] = useState('');
  const [addingLoading, setAddingLoading] = useState(false);
  const [votersModal,   setVotersModal]   = useState(null); // { optionId } или { all: true }
  const [editMode,      setEditMode]      = useState(false);

  const sectionRef = useRef(null);

  // Загружаем опрос
  const loadPoll = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/polls/${pollId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setPoll(data);
    } catch (err) {
      setError('Не удалось загрузить опрос');
    } finally {
      setLoading(false);
    }
  }, [pollId, token]);

  useEffect(() => {
    loadPoll();
  }, [loadPoll]);

  // Переключение выбора варианта
  const toggleOption = (optId) => {
    if (!poll) return;
    if (poll.allowMultiple) {
      setSelected(prev =>
        prev.includes(optId) ? prev.filter(id => id !== optId) : [...prev, optId]
      );
    } else {
      setSelected([optId]);
    }
  };

  // Голосование
  const handleVote = async () => {
    if (!user || selected.length === 0 || voting) return;
    setVoting(true);
    setError('');
    try {
      const { data } = await axios.post(
        `/api/polls/${pollId}/vote`,
        { option_ids: selected },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPoll(data);
      setSelected([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при голосовании');
    } finally {
      setVoting(false);
    }
  };

  // Изменить ответ
  const handleChangeVote = () => {
    setSelected([]);
    // Локально сбрасываем userVotedIds чтобы показать форму голосования
    setPoll(prev => prev ? { ...prev, userVotedIds: [] } : prev);
  };

  // Добавить свой вариант
  const handleAddOption = async () => {
    if (!newOptionText.trim() || addingLoading) return;
    setAddingLoading(true);
    setError('');
    try {
      const { data } = await axios.post(
        `/api/polls/${pollId}/options`,
        { option_text: newOptionText.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPoll(data);
      setNewOptionText('');
      setAddingOption(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при добавлении варианта');
    } finally {
      setAddingLoading(false);
    }
  };

  // Сохранить изменения опроса
  const handleEditConfirm = async (pollData) => {
    setEditMode(false);
    setError('');
    try {
      const { data } = await axios.put(
        `/api/polls/${pollId}`,
        {
          question:          pollData.question,
          description:       pollData.description,
          options:           pollData.options,
          is_anonymous:      pollData.is_anonymous,
          allow_multiple:    pollData.allow_multiple,
          allow_add_options: pollData.allow_add_options,
          allow_change_vote: pollData.allow_change_vote,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPoll(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при сохранении опроса');
    }
  };

  const handleShowMore = () => setShowAll(true);
  const handleCollapse = () => {
    setShowAll(false);
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="poll-viewer poll-viewer--loading" style={cssVars}>
        <div className="poll-viewer__spinner">Загрузка опроса...</div>
      </div>
    );
  }

  if (error && !poll) {
    return (
      <div className="poll-viewer poll-viewer--error" style={cssVars}>
        <p className="poll-viewer__error">{error}</p>
      </div>
    );
  }

  if (!poll) return null;

  const hasVoted  = poll.userVotedIds && poll.userVotedIds.length > 0;
  const showResults = hasVoted || !user;
  const isExpired = poll.endsAt && Math.floor(Date.now() / 1000) > poll.endsAt;
  const canEdit   = user && poll.authorId && user.id === poll.authorId;

  // Варианты для отображения (с возможным перемешиванием)
  let displayOptions = [...(poll.options || [])];
  const totalVotes = poll.totalVotes || 0;

  // Пагинация вариантов
  const visibleOptions = showAll ? displayOptions : displayOptions.slice(0, PAGE_SIZE);
  const hasMore = displayOptions.length > PAGE_SIZE;

  return (
    <div className="poll-viewer" style={cssVars} ref={sectionRef}>

      {/* Заголовок опроса */}
      <div className="poll-viewer__question">
        <span>{poll.question}</span>
        <div className="poll-viewer__question-actions">
          {!poll.isAnonymous && totalVotes > 0 && (
            <button
              type="button"
              className="poll-viewer__stats-icon"
              onClick={() => setVotersModal({ all: true })}
              title="Все голоса"
            >
              📊
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="poll-viewer__edit-btn"
              onClick={() => setEditMode(true)}
              title="Редактировать опрос"
            >
              ✏️
            </button>
          )}
        </div>
      </div>

      {/* Описание */}
      {poll.description && (
        <p className="poll-viewer__description">{poll.description}</p>
      )}

      {/* Метки статуса */}
      <div className="poll-viewer__badges">
        {poll.isAnonymous && <span className="poll-viewer__badge">🔒 Анонимный</span>}
        {poll.allowMultiple && <span className="poll-viewer__badge">✓ Несколько ответов</span>}
        {isExpired && <span className="poll-viewer__badge poll-viewer__badge--expired">Завершён</span>}
      </div>

      {/* Варианты */}
      <div className="poll-viewer__options">
        {visibleOptions.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.votesCount / totalVotes) * 100) : 0;
          const isVoted = poll.userVotedIds?.includes(opt.id);
          const isChosen = selected.includes(opt.id);

          if (showResults || isExpired) {
            // Режим результатов
            return (
              <div
                key={opt.id}
                className={`poll-viewer__option ${isVoted ? 'poll-viewer__option--voted' : ''}`}
              >
                <div className="poll-viewer__option-label">
                  <span className="poll-viewer__option-text">{opt.text}</span>
                  <div className="poll-viewer__option-votes">
                    <span>{pct}%</span>
                    {!poll.isAnonymous && opt.votesCount > 0 && (
                      <button
                        type="button"
                        className="poll-viewer__option-voters-icon"
                        onClick={() => setVotersModal({ optionId: opt.id })}
                        title={`Кто голосовал: ${opt.votesCount}`}
                      >
                        👥 {opt.votesCount}
                      </button>
                    )}
                    {poll.isAnonymous && (
                      <span className="poll-viewer__option-voters-count">
                        {opt.votesCount} гол.
                      </span>
                    )}
                  </div>
                </div>
                <div className="poll-viewer__progress">
                  <div
                    className="poll-viewer__progress-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          }

          // Режим голосования
          return (
            <div
              key={opt.id}
              className={`poll-viewer__option poll-viewer__option--selectable ${isChosen ? 'poll-viewer__option--selected' : ''}`}
              onClick={() => toggleOption(opt.id)}
            >
              <div className="poll-viewer__option-label">
                <span className="poll-viewer__option-control">
                  {poll.allowMultiple
                    ? <span className={`poll-viewer__checkbox ${isChosen ? 'poll-viewer__checkbox--checked' : ''}`} />
                    : <span className={`poll-viewer__radio ${isChosen ? 'poll-viewer__radio--checked' : ''}`} />
                  }
                </span>
                <span className="poll-viewer__option-text">{opt.text}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Пагинация вариантов */}
      {hasMore && (
        <div className="poll-viewer__show-more">
          {!showAll ? (
            <button type="button" onClick={handleShowMore}>
              Показать ещё {displayOptions.length - PAGE_SIZE} →
            </button>
          ) : (
            <button type="button" onClick={handleCollapse}>
              Свернуть ↑
            </button>
          )}
        </div>
      )}

      {/* Добавить свой вариант */}
      {poll.allowAddOptions && user && !isExpired && (
        <div className="poll-viewer__add-option">
          {!addingOption ? (
            <button
              type="button"
              className="poll-viewer__add-option-btn"
              onClick={() => setAddingOption(true)}
            >
              + Добавить вариант
            </button>
          ) : (
            <div className="poll-viewer__add-option-form">
              <input
                type="text"
                className="poll-viewer__add-option-input"
                placeholder="Ваш вариант..."
                value={newOptionText}
                maxLength={200}
                onChange={e => setNewOptionText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddOption(); }}
                autoFocus
              />
              <button
                type="button"
                className="poll-viewer__add-option-submit"
                onClick={handleAddOption}
                disabled={!newOptionText.trim() || addingLoading}
              >
                {addingLoading ? '...' : 'Добавить'}
              </button>
              <button
                type="button"
                className="poll-viewer__add-option-cancel"
                onClick={() => { setAddingOption(false); setNewOptionText(''); }}
              >
                Отмена
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ошибка */}
      {error && <p className="poll-viewer__error">{error}</p>}

      {/* Подвал: счётчик + кнопки */}
      <div className="poll-viewer__footer">
        <span className="poll-viewer__total">
          {totalVotes} {pluralVotes(totalVotes)}
        </span>

        {!showResults && !isExpired && user && (
          <button
            type="button"
            className="poll-viewer__submit"
            onClick={handleVote}
            disabled={selected.length === 0 || voting}
          >
            {voting ? 'Отправка...' : 'Голосовать'}
          </button>
        )}

        {hasVoted && poll.allowChangeVote && !isExpired && (
          <button
            type="button"
            className="poll-viewer__change-vote"
            onClick={handleChangeVote}
          >
            Изменить ответ
          </button>
        )}

        {!user && !isExpired && (
          <span className="poll-viewer__auth-hint">
            Войдите, чтобы проголосовать
          </span>
        )}
      </div>

      {/* Модальное окно проголосовавших */}
      {votersModal && (
        <VotersModal
          pollId={pollId}
          poll={poll}
          mode={votersModal.all ? 'all' : 'option'}
          optionId={votersModal.optionId}
          onClose={() => setVotersModal(null)}
          cssVars={cssVars}
        />
      )}

      {/* Редактор опроса */}
      {editMode && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div style={{ width: '100%', maxWidth: '540px' }}>
            <PollBuilder
              initialData={{
                question:         poll.question,
                description:      poll.description || '',
                options:          poll.options.map(o => ({ id: o.id, text: o.text, votesCount: o.votesCount })),
                isAnonymous:      poll.isAnonymous,
                allowMultiple:    poll.allowMultiple,
                allowAddOptions:  poll.allowAddOptions,
                allowChangeVote:  poll.allowChangeVote,
              }}
              onConfirm={handleEditConfirm}
              onCancel={() => setEditMode(false)}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function pluralVotes(n) {
  const abs = Math.abs(n);
  if (abs % 10 === 1 && abs % 100 !== 11) return 'голос';
  if ([2,3,4].includes(abs % 10) && ![12,13,14].includes(abs % 100)) return 'голоса';
  return 'голосов';
}

export default PollViewer;
