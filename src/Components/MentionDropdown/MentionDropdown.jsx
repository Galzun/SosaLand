// Components/MentionDropdown/MentionDropdown.jsx
// Переиспользуемый дропдаун для @упоминаний.
//
// Props:
//   players      — отфильтрованный массив игроков
//   activeIndex  — индекс выделенного пункта
//   onSelect(name) — вставить имя
//   onHover(idx)   — обновить activeIndex при наведении
//   dropRef        — ref для обнаружения клика вне

import './MentionDropdown.scss';

function MentionDropdown({ players, activeIndex, onSelect, onHover, dropRef }) {
  if (!players.length) return null;

  return (
    <div ref={dropRef} className="mention-drop">
      {players.map((player, idx) => (
        <button
          key={player.name}
          type="button"
          className={`mention-drop__item${idx === activeIndex ? ' mention-drop__item--active' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(player.name); }}
          onMouseEnter={() => onHover(idx)}
        >
          <img
            className="mention-drop__avatar"
            src={player.avatarUrl}
            alt={player.name}
          />
          <span className="mention-drop__name">@{player.name}</span>
        </button>
      ))}
    </div>
  );
}

export default MentionDropdown;
