import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './Components//Header/Header';
import Home from './pages/Home/Home';
import Gallery from './pages/Gallery/Gallery';
import PlayerPage from './pages/PlayerPage/PlayerPage';
import useServerStatus from './hooks/useServerStatus';
import AuthPage from './pages/Auth/AuthPage';
import { PlayerProvider } from './context/PlayerContext';
import './styles/global.scss';

function App() {
  const { players, allPlayers, loading, error } = useServerStatus('5.188.158.73:32887');
  
  const headerColor = error ? '#ff4a4a' : '#4aff9e';
  
  const headerProps = {
    serverIp: 'Sosaland.wellduck.org',
    borderColor: headerColor
  };

  return (
    <BrowserRouter>
      <PlayerProvider allPlayers={allPlayers} onlinePlayers={players}>
        <Header {...headerProps} />
        
        <Routes>
          <Route path="/" element={<Home loading={loading} error={error} />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/player/:username" element={<PlayerPage />} />
          <Route path="/auth" element={<AuthPage />} />
        </Routes>
      </PlayerProvider>
    </BrowserRouter>
  );
}

export default App;