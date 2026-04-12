import PlayerCard from '../../Components/PlayerCard/PlayerCard.jsx';
import { usePlayer } from '../../context/PlayerContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import './Home.scss';

function Home({ loading, error }) {
  const { allPlayers } = usePlayer();
  const { user, token } = useAuth();

  const renderContent = () => {
    if (loading) {
      return <div className="home__loading">Загрузка игроков...</div>;
    }

    if (error) {
      return <div className="home__error">Ошибка: {error}</div>;
    }

    return (
      <>
        {/* Сетка карточек со ВСЕМИ игроками: забаненные — в конце */}
        <div className="home__grid">
          {[...allPlayers]
            .sort((a, b) => {
              if (a.isBanned && !b.isBanned) return 1;
              if (!a.isBanned && b.isBanned) return -1;
              return 0;
            })
            .map(player => (
              <PlayerCard
                key={player.uuid || player.id || player.name}
                username={player.name}
                uuid={player.uuid}
                status={player.isOnline ? 'online' : 'offline'}
                currentUser={user}
                token={token}
              />
            ))
          }
        </div>
      </>
    );
  };

  return (
    <main className="home">
      {renderContent()}
    </main>
  );
}

export default Home;
