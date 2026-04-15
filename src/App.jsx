import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './Components//Header/Header';
import Sidebar from './Components/Sidebar/Sidebar';
import Home from './pages/Home/Home';
import Gallery from './pages/Gallery/Gallery';
import PlayerPage from './pages/PlayerPage/PlayerPage';
import useServerStatus from './hooks/useServerStatus';
import AuthPage from './pages/Auth/AuthPage';
import Tickets from './pages/Dashboard/Tickets';
import EditProfile from './pages/Dashboard/EditProfile';
import FeedPage from './pages/Feed/FeedPage';
import EventsPage from './pages/Events/EventsPage';
import EventDetailPage from './pages/Events/EventDetailPage';
import EventCreate from './pages/Dashboard/EventCreate';
import MessagesPage from './pages/Messages/MessagesPage';
import NewsPage from './pages/News/NewsPage';
import NewsDetailPage from './pages/News/NewsDetailPage';
import NewsCreate from './pages/Dashboard/NewsCreate';
import LogsPage from './pages/Dashboard/LogsPage';
import PostPage from './pages/PostPage/PostPage';
import { PlayerProvider } from './context/PlayerContext';
// AuthProvider оборачивает всё приложение и предоставляет useAuth() везде.
import { AuthProvider } from './context/AuthContext';
import { DialogRenderer } from './Components/Dialog/Dialog';
import './styles/global.scss';
import './App.scss';

function App() {
  const { players, allPlayers, loading, error } = useServerStatus('5.188.158.73:32887');

  const headerColor = error ? '#ff4a4a' : '#4aff9e';

  const headerProps = {
    serverIp: 'Sosaland.wellduck.org',
    borderColor: headerColor
  };

  return (
    <BrowserRouter>
      {/* AuthProvider должен быть внутри BrowserRouter, чтобы useNavigate работал в хуке */}
      <AuthProvider>
        <PlayerProvider allPlayers={allPlayers} onlinePlayers={players}>
          {/* Шапка — полная ширина, sticky */}
          <Header {...headerProps} />

          {/* Основной лэйаут: сайдбар слева + контент */}
          <div className="app-layout">
            <Sidebar serverIp={headerProps.serverIp} borderColor={headerColor} />

            {/* Основной контент */}
            <div className="app__main">

            <Routes>
              <Route path="/" element={<Home loading={loading} error={error} />} />
              <Route path="/feed" element={<FeedPage />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:slug" element={<EventDetailPage />} />
              <Route path="/dashboard/events/create" element={<EventCreate />} />
              <Route path="/dashboard/events/:slug/edit" element={<EventCreate />} />
              <Route path="/player/:username" element={<PlayerPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/dashboard/tickets" element={<Tickets />} />
              <Route path="/dashboard/profile" element={<EditProfile />} />
              <Route path="/dashboard/news/create" element={<NewsCreate />} />
              <Route path="/dashboard/news/:slug/edit" element={<NewsCreate />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/news/:slug" element={<NewsDetailPage />} />
              <Route path="/dashboard/logs" element={<LogsPage />} />
              <Route path="/post/:id" element={<PostPage />} />
            </Routes>
            </div>
          </div>
          {/* Кастомные диалоги (заменяют window.confirm / window.prompt) */}
          <DialogRenderer />
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
