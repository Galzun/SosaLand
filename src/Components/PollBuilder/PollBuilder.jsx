// Components/PollBuilder/PollBuilder.jsx
// Конструктор опроса: используется в RichTextEditor, PostForm и PollViewer (редактирование).
//
// Props:
//   onConfirm(pollData) — данные для POST /api/polls (создание) или PUT /api/polls/:id (редактирование)
//   onCancel()          — закрыть без создания/сохранения
//   initialData         — если передан, переходим в режим редактирования:
//                         { question, description, options: [{id, text, votesCount}],
//                           isAnonymous, allowMultiple, allowAddOptions, allowChangeVote }

import { useState, useCallback } from 'react';
import './PollBuilder.scss';

const OPTION_MAX    = 200;
const QUESTION_MAX  = 300;
const DESC_MAX      = 500;
const OPTIONS_MIN   = 2;
const OPTIONS_MAX   = 25;

function PollBuilder({ onConfirm, onCancel, initialData }) {
  const isEdit = Boolean(initialData);

  const [question,        setQuestion]        = useState(initialData?.question        || '');
  const [description,     setDescription]     = useState(initialData?.description     || '');
  // options: [{id: string|null, text: string, votesCount: number}]
  const [options,         setOptions]         = useState(
    initialData?.options?.map(o => ({ id: o.id || null, text: o.text, votesCount: o.votesCount || 0 }))
    || [{ id: null, text: '' }, { id: null, text: '' }]
  );
  const [isAnonymous,     setIsAnonymous]     = useState(initialData?.isAnonymous     ?? false);
  const [allowMultiple,   setAllowMultiple]   = useState(initialData?.allowMultiple   ?? false);
  const [allowAddOptions, setAllowAddOptions] = useState(initialData?.allowAddOptions ?? false);
  const [allowChangeVote, setAllowChangeVote] = useState(initialData?.allowChangeVote ?? false);
  const [error,           setError]           = useState('');

  const addOption = useCallback(() => {
    if (options.length >= OPTIONS_MAX) return;
    setOptions(prev => [...prev, { id: null, text: '', votesCount: 0 }]);
  }, [options.length]);

  const removeOption = useCallback((idx) => {
    if (options.length <= OPTIONS_MIN) return;
    setOptions(prev => prev.filter((_, i) => i !== idx));
  }, [options.length]);

  const updateOption = useCallback((idx, val) => {
    setOptions(prev => prev.map((o, i) => i === idx ? { ...o, text: val } : o));
  }, []);

  const handleConfirm = () => {
    setError('');

    if (!question.trim()) {
      setError('Введите вопрос опроса');
      return;
    }
    if (question.trim().length > QUESTION_MAX) {
      setError(`Вопрос не более ${QUESTION_MAX} символов`);
      return;
    }

    const filled = options.filter(o => o.text.trim());
    if (filled.length < OPTIONS_MIN) {
      setError(`Введите минимум ${OPTIONS_MIN} варианта ответа`);
      return;
    }

    for (const opt of filled) {
      if (opt.text.trim().length > OPTION_MAX) {
        setError(`Вариант ответа не более ${OPTION_MAX} символов`);
        return;
      }
    }

    onConfirm({
      question:          question.trim(),
      description:       description.trim() || null,
      // Создание — строки; редактирование — объекты {id?, text}
      options: isEdit
        ? filled.map(o => ({ ...(o.id ? { id: o.id } : {}), text: o.text.trim() }))
        : filled.map(o => o.text.trim()),
      is_anonymous:      isAnonymous,
      allow_multiple:    allowMultiple,
      allow_add_options: allowAddOptions,
      allow_change_vote: allowChangeVote,
    });
  };

  const filledOptions = options.filter(o => o.text.trim());

  return (
    <div className="poll-builder">
      <div className="poll-builder__header">
        <span className="poll-builder__title">
          {isEdit ? '✏️ Редактировать опрос' : '📊 Создать опрос'}
        </span>
        <button type="button" className="poll-builder__close" onClick={onCancel} title="Закрыть">✕</button>
      </div>

      <div className="poll-builder__body">
        {/* Вопрос */}
        <div className="poll-builder__field">
          <label className="poll-builder__label">
            Вопрос
            <span className="poll-builder__char-count">{question.length}/{QUESTION_MAX}</span>
          </label>
          <textarea
            className="poll-builder__textarea"
            placeholder="Введите вопрос опроса..."
            value={question}
            maxLength={QUESTION_MAX}
            rows={2}
            onChange={e => setQuestion(e.target.value)}
          />
        </div>

        {/* Описание */}
        <div className="poll-builder__field">
          <label className="poll-builder__label">
            Описание
            <span className="poll-builder__label-hint">(необязательно)</span>
          </label>
          <input
            type="text"
            className="poll-builder__input"
            placeholder="Дополнительное пояснение..."
            value={description}
            maxLength={DESC_MAX}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* Варианты */}
        <div className="poll-builder__field">
          <label className="poll-builder__label">
            Варианты ответа
            <span className="poll-builder__label-hint">({filledOptions.length}/{OPTIONS_MAX})</span>
          </label>
          <div className="poll-builder__options">
            {options.map((opt, idx) => (
              <div key={idx} className="poll-builder__option-row">
                <span className="poll-builder__option-num">{idx + 1}</span>
                <input
                  type="text"
                  className="poll-builder__input"
                  placeholder={`Вариант ${idx + 1}...`}
                  value={opt.text}
                  maxLength={OPTION_MAX}
                  onChange={e => updateOption(idx, e.target.value)}
                />
                <button
                  type="button"
                  className="poll-builder__option-remove"
                  onClick={() => removeOption(idx)}
                  disabled={options.length <= OPTIONS_MIN || opt.votesCount > 0}
                  title={opt.votesCount > 0 ? 'Нельзя удалить — есть голоса' : 'Удалить вариант'}
                >✕</button>
              </div>
            ))}
          </div>
          {options.length < OPTIONS_MAX && (
            <button
              type="button"
              className="poll-builder__add-option"
              onClick={addOption}
            >
              + Добавить вариант
            </button>
          )}
        </div>

        {/* Настройки */}
        <div className="poll-builder__field">
          <label className="poll-builder__label">Настройки</label>
          <div className="poll-builder__settings">
            <label className="poll-builder__checkbox-row">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={e => setIsAnonymous(e.target.checked)}
              />
              <span>Анонимный опрос</span>
            </label>
            <label className="poll-builder__checkbox-row">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={e => setAllowMultiple(e.target.checked)}
              />
              <span>Можно выбрать несколько вариантов</span>
            </label>
            <label className="poll-builder__checkbox-row">
              <input
                type="checkbox"
                checked={allowAddOptions}
                onChange={e => setAllowAddOptions(e.target.checked)}
              />
              <span>Участники могут добавлять свои варианты</span>
            </label>
            <label className="poll-builder__checkbox-row">
              <input
                type="checkbox"
                checked={allowChangeVote}
                onChange={e => setAllowChangeVote(e.target.checked)}
              />
              <span>Разрешить изменить ответ</span>
            </label>
          </div>
        </div>

        {error && <p className="poll-builder__error">{error}</p>}
      </div>

      <div className="poll-builder__footer">
        <button type="button" className="poll-builder__btn-cancel" onClick={onCancel}>
          Отмена
        </button>
        <button
          type="button"
          className="poll-builder__btn-confirm"
          onClick={handleConfirm}
          disabled={!question.trim() || filledOptions.length < OPTIONS_MIN}
        >
          {isEdit ? 'Сохранить' : 'Добавить опрос'}
        </button>
      </div>
    </div>
  );
}

export default PollBuilder;
