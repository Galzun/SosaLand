// Components/EmojiPicker/EmojiPicker.jsx
// Простой пикер смайликов — выпадающий список часто используемых эмодзи.
//
// Props:
//   onSelect(emoji) — вызывается при клике по эмодзи
// Позиционирование: position:absolute внутри position:relative родителя.
// Родитель должен управлять видимостью и закрытием по клику вне.

import './EmojiPicker.scss';

const EMOJIS = [
  '😊','😂','❤️','👍','🔥','🎉','😍','🤔','👋','✨',
  '😎','🙏','💪','🎮','⚔️','🏆','💎','🌟','🤣','😅',
  '🙂','😁','😆','😜','🤩','😇','🥳','🤯','😱','👀',
  '💯','🚀','🌈','🍀','❄️','⚡','🎯','💥','🎵','🐉',
  '🫡','🫶','🥲','😤','🤝','👑','🛡️','⚙️','🌙','☀️',
];

function EmojiPicker({ onSelect }) {
  return (
    <div className="emoji-picker" onMouseDown={(e) => e.stopPropagation()}>
      {EMOJIS.map(em => (
        <button
          key={em}
          type="button"
          className="emoji-picker__btn"
          onClick={() => onSelect(em)}
        >
          {em}
        </button>
      ))}
    </div>
  );
}

export default EmojiPicker;
