import PlayerCard from '../../Components/PlayerCard/PlayerCard.jsx';
import { usePlayer } from '../../context/PlayerContext.jsx'
import './Home.scss';

function Home({ loading, error }) {

  const { allPlayers, } = usePlayer()
  
  const renderContent = () => {
    if (loading) {
      return <div className="home__loading">Загрузка игроков...</div>;
    }
    
    if (error) {
      return <div className="home__error">Ошибка: {error}</div>;
    }
    
    return (
      <>
        {/* Сетка карточек со ВСЕМИ игроками */}
        <div className="home__grid">
          {allPlayers.map(player => (
            <PlayerCard 
              key={player.uuid || player.id || player.name}
              username={player.name}
              uuid={player.uuid}
              status={player.isOnline ? 'online' : 'offline'}  // 👈 преобразуем isOnline в status
            />
          ))}
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