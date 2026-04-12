// Components/PlayerListViewer/PlayerListViewer.jsx
// Горизонтальный список игроков — рендерится внутри новостей.
// Props:
//   players  — [{ name, uuid }]
//   cssVars  — объект CSS-переменных (--cards-*)

import { Link } from 'react-router-dom';
import './PlayerListViewer.scss';

const CRAFATAR = 'https://crafatar.icehost.xyz/avatars/';
const DICEBEAR  = 'https://api.dicebear.com/9.x/initials/svg?scale=80&backgroundColor[]&fontWeight=600&seed=';

function PlayerListViewer({ players = [], cssVars = {} }) {
  if (!players.length) return null;

  return (
    <div className="player-list-viewer" style={cssVars}>
      {players.map((p, i) => {
        const avatarUrl = p.uuid
          ? `${CRAFATAR}${p.uuid}?overlay`
          : `${DICEBEAR}${encodeURIComponent(p.name)}`;

        return (
          <Link key={i} to={`/player/${p.name}`} className="player-list-viewer__item">
            <img
              className="player-list-viewer__avatar"
              src={avatarUrl}
              alt={p.name}
              onError={e => {
                e.target.src = `${DICEBEAR}${encodeURIComponent(p.name)}`;
              }}
            />
            <span className="player-list-viewer__name">{p.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default PlayerListViewer;
