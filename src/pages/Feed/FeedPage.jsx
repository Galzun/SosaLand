// pages/Feed/FeedPage.jsx
// Страница ленты постов: /feed

import PostForm from '../../Components/PostForm/PostForm';
import PostCard from '../../Components/PostCard/PostCard';
import usePosts from '../../hooks/usePosts';
import { useAuth } from '../../context/AuthContext';
import './FeedPage.scss';

function FeedPage() {
  const { user } = useAuth();

  const {
    posts,
    loading,
    hasMore,
    loadMore,
    createPost,
    toggleLike,
    deletePost,
  } = usePosts();

  const handleSubmit = async (content, attachments) => {
    await createPost(content, attachments);
  };

  return (
    <main className="feed-page">
      <div className="feed-page__container">
        <h1 className="feed-page__title">Лента</h1>

        {user && <PostForm onSubmit={handleSubmit} />}

        <div className="feed-page__posts">
          {posts.length === 0 && !loading && (
            <div className="feed-page__empty">
              <p>Пока нет постов.</p>
              {user && <p>Будьте первым — напишите что-нибудь!</p>}
              {!user && <p>Войдите, чтобы создать первый пост.</p>}
            </div>
          )}

          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onLike={toggleLike}
              onDelete={deletePost}
            />
          ))}
        </div>

        {loading && (
          <div className="feed-page__loading">
            <span className="feed-page__spinner" />
            Загрузка...
          </div>
        )}

        {!loading && hasMore && posts.length > 0 && (
          <button className="feed-page__load-more" onClick={loadMore}>
            Показать ещё
          </button>
        )}

        {!loading && !hasMore && posts.length > 0 && (
          <p className="feed-page__end">Это все посты</p>
        )}
      </div>
    </main>
  );
}

export default FeedPage;
