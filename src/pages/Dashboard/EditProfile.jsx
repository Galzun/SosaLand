// pages/Dashboard/EditProfile.jsx
// Страница редактирования профиля: /dashboard/profile

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../Components/ImageUpload/ImageUpload';
import './EditProfile.scss';

const STATUS_MAX_LENGTH = 50;

// Дефолтные значения параметров изображения — используются при сбросе.
const COVER_DEFAULTS            = { posX: 50, posY: 50, scale: 100, rotation: 0, fillColor: '', blur: 0, edge: 0 };
const BG_DEFAULTS               = { posX: 50, posY: 50, scale: 100, rotation: 0, fillColor: '', blur: 0, edge: 0 };
const CARD_BG_DEFAULTS          = { color: '#1a1a1a', alpha: 95, blur: 0 };
const HEADER_DEFAULTS  = {
  color: '#1a1a1a', alpha: 95,  blur: 0,
  borderColor: '',  borderWidth: 0,  borderRadius: 12,
  textColor: '',    accentColor: '',
};
const CONTENT_DEFAULTS = {
  color: '#0a0a1a', alpha: 0,   blur: 0,
  borderColor: '',  borderWidth: 0,  borderRadius: 10,
  textColor: '',
};
const CARDS_DEFAULTS   = {
  color: '#1a1a1a', alpha: 95,  blur: 0,
  borderColor: '',  borderWidth: 1,  borderRadius: 12,
  textColor: '',    accentColor: '',
};

function EditProfile() {
  const { user, token, loading: authLoading, updateUser } = useAuth();
  const navigate = useNavigate();

  // --- Обложка ---
  const [coverUrl,       setCoverUrl]       = useState('');
  const [coverPosX,      setCoverPosX]      = useState(COVER_DEFAULTS.posX);
  const [coverPosY,      setCoverPosY]      = useState(COVER_DEFAULTS.posY);
  const [coverScale,     setCoverScale]     = useState(COVER_DEFAULTS.scale);
  const [coverRotation,  setCoverRotation]  = useState(COVER_DEFAULTS.rotation);
  const [coverFillColor, setCoverFillColor] = useState(COVER_DEFAULTS.fillColor);
  const [coverBlur,      setCoverBlur]      = useState(COVER_DEFAULTS.blur);
  const [coverEdge,      setCoverEdge]      = useState(COVER_DEFAULTS.edge);

  // --- Фон страницы ---
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [bgPosX,        setBgPosX]        = useState(BG_DEFAULTS.posX);
  const [bgPosY,        setBgPosY]        = useState(BG_DEFAULTS.posY);
  const [bgScale,       setBgScale]       = useState(BG_DEFAULTS.scale);
  const [bgRotation,    setBgRotation]    = useState(BG_DEFAULTS.rotation);
  const [bgFillColor,   setBgFillColor]   = useState(BG_DEFAULTS.fillColor);
  const [bgBlur,        setBgBlur]        = useState(BG_DEFAULTS.blur);
  const [bgEdge,        setBgEdge]        = useState(BG_DEFAULTS.edge);

  // --- О себе ---
  const [bio, setBio] = useState('');

  // --- Шапка профиля (content_wrapper_*) ---
  const [headerBgColor,      setHeaderBgColor]      = useState(HEADER_DEFAULTS.color);
  const [headerBgAlpha,      setHeaderBgAlpha]      = useState(HEADER_DEFAULTS.alpha);
  const [headerBlur,         setHeaderBlur]         = useState(HEADER_DEFAULTS.blur);
  const [headerBorderColor,  setHeaderBorderColor]  = useState(HEADER_DEFAULTS.borderColor);
  const [headerBorderWidth,  setHeaderBorderWidth]  = useState(HEADER_DEFAULTS.borderWidth);
  const [headerBorderRadius, setHeaderBorderRadius] = useState(HEADER_DEFAULTS.borderRadius);
  const [headerTextColor,    setHeaderTextColor]    = useState(HEADER_DEFAULTS.textColor);
  const [headerAccentColor,  setHeaderAccentColor]  = useState(HEADER_DEFAULTS.accentColor);

  // --- Область контента (content_*) ---
  const [contentBgColor,      setContentBgColor]      = useState(CONTENT_DEFAULTS.color);
  const [contentBgAlpha,      setContentBgAlpha]      = useState(CONTENT_DEFAULTS.alpha);
  const [contentBlur,         setContentBlur]         = useState(CONTENT_DEFAULTS.blur);
  const [contentBorderColor,  setContentBorderColor]  = useState(CONTENT_DEFAULTS.borderColor);
  const [contentBorderWidth,  setContentBorderWidth]  = useState(CONTENT_DEFAULTS.borderWidth);
  const [contentBorderRadius, setContentBorderRadius] = useState(CONTENT_DEFAULTS.borderRadius);
  const [contentTextColor,    setContentTextColor]    = useState(CONTENT_DEFAULTS.textColor);

  // --- Карточки и вкладки — объединённая группа (post_card_*) ---
  const [cardsBgColor,      setCardsBgColor]      = useState(CARDS_DEFAULTS.color);
  const [cardsBgAlpha,      setCardsBgAlpha]      = useState(CARDS_DEFAULTS.alpha);
  const [cardsBlur,         setCardsBlur]         = useState(CARDS_DEFAULTS.blur);
  const [cardsBorderColor,  setCardsBorderColor]  = useState(CARDS_DEFAULTS.borderColor);
  const [cardsBorderWidth,  setCardsBorderWidth]  = useState(CARDS_DEFAULTS.borderWidth);
  const [cardsBorderRadius, setCardsBorderRadius] = useState(CARDS_DEFAULTS.borderRadius);
  const [cardsTextColor,    setCardsTextColor]    = useState(CARDS_DEFAULTS.textColor);
  const [cardsAccentColor,  setCardsAccentColor]  = useState(CARDS_DEFAULTS.accentColor);

  // --- Фон карточки (устаревшее, оставлено для совместимости) ---
  const [cardBgColor, setCardBgColor] = useState('#1a1a1a');
  const [cardBgAlpha, setCardBgAlpha] = useState(95);
  const [cardBgBlur,  setCardBgBlur]  = useState(0);

  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState(null);

  // Загружаем текущие данные профиля при монтировании.
  useEffect(() => {
    if (!user) return;
    axios.get(`/api/users/${user.id}`).then(({ data }) => {
      setCoverUrl(data.coverUrl || '');
      setCoverPosX(data.coverPosX ?? COVER_DEFAULTS.posX);
      setCoverPosY(data.coverPosY ?? COVER_DEFAULTS.posY);
      setCoverScale(data.coverScale ?? COVER_DEFAULTS.scale);
      setCoverRotation(data.coverRotation ?? COVER_DEFAULTS.rotation);
      setCoverFillColor(data.coverFillColor || '');
      setCoverBlur(data.coverBlur ?? COVER_DEFAULTS.blur);
      setCoverEdge(data.coverEdge ?? COVER_DEFAULTS.edge);
      setBackgroundUrl(data.backgroundUrl || '');
      setBgPosX(data.bgPosX ?? BG_DEFAULTS.posX);
      setBgPosY(data.bgPosY ?? BG_DEFAULTS.posY);
      setBgScale(data.bgScale ?? BG_DEFAULTS.scale);
      setBgRotation(data.bgRotation ?? BG_DEFAULTS.rotation);
      setBgFillColor(data.bgFillColor || '');
      setBgBlur(data.bgBlur ?? BG_DEFAULTS.blur);
      setBgEdge(data.bgEdge ?? BG_DEFAULTS.edge);
      setBio(data.bio || '');
      setCardBgColor(data.cardBgColor || '#1a1a1a');
      setCardBgAlpha(data.cardBgAlpha ?? 95);
      setCardBgBlur(data.cardBgBlur ?? 0);
      // Шапка профиля
      setHeaderBgColor(data.contentWrapperBgColor || HEADER_DEFAULTS.color);
      setHeaderBgAlpha(data.contentWrapperBgAlpha ?? HEADER_DEFAULTS.alpha);
      setHeaderBlur(data.contentWrapperBlur ?? HEADER_DEFAULTS.blur);
      setHeaderBorderColor(data.contentWrapperBorderColor || HEADER_DEFAULTS.borderColor);
      setHeaderBorderWidth(data.contentWrapperBorderWidth ?? HEADER_DEFAULTS.borderWidth);
      setHeaderBorderRadius(data.contentWrapperBorderRadius ?? HEADER_DEFAULTS.borderRadius);
      setHeaderTextColor(data.contentWrapperTextColor || HEADER_DEFAULTS.textColor);
      setHeaderAccentColor(data.contentWrapperAccentColor || HEADER_DEFAULTS.accentColor);
      // Область контента
      setContentBgColor(data.contentBgColor || CONTENT_DEFAULTS.color);
      setContentBgAlpha(data.contentBgAlpha ?? CONTENT_DEFAULTS.alpha);
      setContentBlur(data.contentBlur ?? CONTENT_DEFAULTS.blur);
      setContentBorderColor(data.contentBorderColor || CONTENT_DEFAULTS.borderColor);
      setContentBorderWidth(data.contentBorderWidth ?? CONTENT_DEFAULTS.borderWidth);
      setContentBorderRadius(data.contentBorderRadius ?? CONTENT_DEFAULTS.borderRadius);
      setContentTextColor(data.contentTextColor || CONTENT_DEFAULTS.textColor);
      // Карточки и вкладки
      setCardsBgColor(data.postCardBgColor || CARDS_DEFAULTS.color);
      setCardsBgAlpha(data.postCardBgAlpha ?? CARDS_DEFAULTS.alpha);
      setCardsBlur(data.postCardBlur ?? CARDS_DEFAULTS.blur);
      setCardsBorderColor(data.postCardBorderColor || CARDS_DEFAULTS.borderColor);
      setCardsBorderWidth(data.postCardBorderWidth ?? CARDS_DEFAULTS.borderWidth);
      setCardsBorderRadius(data.postCardBorderRadius ?? CARDS_DEFAULTS.borderRadius);
      setCardsTextColor(data.postCardTextColor || CARDS_DEFAULTS.textColor);
      setCardsAccentColor(data.postCardAccentColor || CARDS_DEFAULTS.accentColor);
    }).catch(err => console.error('Ошибка загрузки профиля:', err.message));
  }, [user]);

  // Редирект неавторизованных.
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  if (authLoading || !user) {
    return <main className="edit-profile"><div className="edit-profile__loading">Загрузка...</div></main>;
  }

  const posStyle    = (x, y)  => `${x}% ${y}%`;
  const sizeStyle   = (scale) => `${scale}%`;
  const rotStyle    = (deg)   => deg !== 0 ? `rotate(${deg}deg)` : undefined;
  const filterStyle = (blur)  => blur > 0 ? `blur(${blur}px)` : undefined;

  // CSS-маска для плавного растворения краёв.
  const edgeMask = (edge) => {
    if (!edge) return {};
    const p = Math.round(edge * 0.4);
    const h = `linear-gradient(to right, transparent 0%, black ${p}%, black ${100 - p}%, transparent 100%)`;
    const v = `linear-gradient(to bottom, transparent 0%, black ${p}%, black ${100 - p}%, transparent 100%)`;
    return {
      WebkitMaskImage:     `${h}, ${v}`,
      maskImage:           `${h}, ${v}`,
      WebkitMaskComposite: 'destination-in',
      maskComposite:       'intersect',
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (bio.length > STATUS_MAX_LENGTH) {
      setError(`Статус не должен превышать ${STATUS_MAX_LENGTH} символов`);
      return;
    }

    setSaving(true);
    try {
      const { data } = await axios.put(
        `/api/users/${user.id}/profile`,
        {
          coverUrl:      coverUrl.trim()      || null,
          backgroundUrl: backgroundUrl.trim() || null,
          bio:           bio.trim()           || null,
          coverPosX, coverPosY, coverScale,
          coverRotation, coverFillColor: coverFillColor || null, coverBlur, coverEdge,
          bgPosX, bgPosY, bgScale,
          bgRotation, bgFillColor: bgFillColor || null, bgBlur, bgEdge,
          cardBgColor, cardBgAlpha, cardBgBlur,
          // Шапка профиля → content_wrapper_*
          contentWrapperBgColor:      headerBgColor,
          contentWrapperBgAlpha:      headerBgAlpha,
          contentWrapperBlur:         headerBlur,
          contentWrapperBorderColor:  headerBorderColor  || null,
          contentWrapperBorderWidth:  headerBorderWidth,
          contentWrapperBorderRadius: headerBorderRadius,
          contentWrapperTextColor:    headerTextColor    || null,
          contentWrapperAccentColor:  headerAccentColor  || null,
          // Область контента → content_*
          contentBgColor, contentBgAlpha, contentBlur,
          contentBorderColor:  contentBorderColor  || null,
          contentBorderWidth,  contentBorderRadius,
          contentTextColor:    contentTextColor    || null,
          // Карточки и вкладки → post_card_*
          postCardBgColor:      cardsBgColor,
          postCardBgAlpha:      cardsBgAlpha,
          postCardBlur:         cardsBlur,
          postCardBorderColor:  cardsBorderColor  || null,
          postCardBorderWidth:  cardsBorderWidth,
          postCardBorderRadius: cardsBorderRadius,
          postCardTextColor:    cardsTextColor    || null,
          postCardAccentColor:  cardsAccentColor  || null,
          // Устаревшие поля (tabs/postForm) — передаём значения карточек для совместимости
          tabsBgColor: cardsBgColor, tabsBgAlpha: cardsBgAlpha, tabsBlur: cardsBlur,
          postFormBgColor: cardsBgColor, postFormBgAlpha: cardsBgAlpha, postFormBlur: cardsBlur,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      updateUser({ coverUrl: data.coverUrl, backgroundUrl: data.backgroundUrl, bio: data.bio });
      setSuccess(true);
      setTimeout(() => navigate(`/player/${user.username}`), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при сохранении профиля');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="edit-profile">
      <div className="edit-profile__container">
        <h1 className="edit-profile__title">Редактировать профиль</h1>

        <form className="edit-profile__form" onSubmit={handleSubmit}>

          {/* ======== ОБЛОЖКА ======== */}
          <div className="edit-profile__field">
            <label className="edit-profile__label">
              Обложка профиля
              <span className="edit-profile__label-hint">Баннер в шапке страницы игрока</span>
            </label>

            <div className="edit-profile__image-row">
              <ImageUpload
                label="Загрузить файл"
                currentUrl={null}
                onUpload={(url) => setCoverUrl(url)}
                disabled={saving}
              />
              {coverUrl && (
                <button
                  type="button"
                  className="edit-profile__btn edit-profile__btn--remove"
                  onClick={() => setCoverUrl('')}
                  disabled={saving}
                >
                  Удалить обложку
                </button>
              )}
            </div>

            <input
              type="text"
              className="edit-profile__input"
              placeholder="Или вставьте ссылку на изображение..."
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              disabled={saving}
            />

            <ColorField label="Цвет обложки" value={coverFillColor} onChange={setCoverFillColor} onReset={() => setCoverFillColor('')} />

            {coverUrl && (
              <div className="edit-profile__image-controls">
                {/* Превью */}
                <div className="edit-profile__preview-cover" style={{ background: coverFillColor || undefined }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage:    `url(${coverUrl})`,
                    backgroundPosition: posStyle(coverPosX, coverPosY),
                    backgroundSize:     sizeStyle(coverScale),
                    backgroundRepeat:   'no-repeat',
                    transform:          rotStyle(coverRotation),
                    filter:             filterStyle(coverBlur),
                    ...edgeMask(coverEdge),
                  }} />
                </div>

                {/* Слайдеры */}
                <div className="edit-profile__sliders">
                  <SliderField label="Влево / Вправо"  value={coverPosX}     onChange={setCoverPosX}     min={0}  max={100} unit="%" onReset={() => setCoverPosX(COVER_DEFAULTS.posX)} />
                  <SliderField label="Вверх / Вниз"    value={coverPosY}     onChange={setCoverPosY}     min={0}  max={100} unit="%" onReset={() => setCoverPosY(COVER_DEFAULTS.posY)} />
                  <SliderField label="Масштаб"          value={coverScale}    onChange={setCoverScale}    min={20} max={200} unit="%" onReset={() => setCoverScale(COVER_DEFAULTS.scale)} />
                  <SliderField label="Поворот"          value={coverRotation} onChange={setCoverRotation} min={0}  max={359} unit="°" onReset={() => setCoverRotation(COVER_DEFAULTS.rotation)} />
                  <SliderField label="Размытие"         value={coverBlur}     onChange={setCoverBlur}     min={0}  max={20}  unit="px" onReset={() => setCoverBlur(COVER_DEFAULTS.blur)} />
                  <SliderField label="Плавность краёв" value={coverEdge}     onChange={setCoverEdge}     min={0}  max={100} unit=""   onReset={() => setCoverEdge(COVER_DEFAULTS.edge)} />
                </div>
              </div>
            )}
          </div>

          {/* ======== ФОН СТРАНИЦЫ ======== */}
          <div className="edit-profile__field">
            <label className="edit-profile__label">
              Фон страницы
              <span className="edit-profile__label-hint">Фоновое изображение всей страницы профиля</span>
            </label>

            <div className="edit-profile__image-row">
              <ImageUpload
                label="Загрузить файл"
                currentUrl={null}
                onUpload={(url) => setBackgroundUrl(url)}
                disabled={saving}
              />
              {backgroundUrl && (
                <button
                  type="button"
                  className="edit-profile__btn edit-profile__btn--remove"
                  onClick={() => setBackgroundUrl('')}
                  disabled={saving}
                >
                  Удалить фон
                </button>
              )}
            </div>

            <input
              type="text"
              className="edit-profile__input"
              placeholder="Или вставьте ссылку на изображение..."
              value={backgroundUrl}
              onChange={(e) => setBackgroundUrl(e.target.value)}
              disabled={saving}
            />

            <ColorField label="Цвет фона страницы" value={bgFillColor} onChange={setBgFillColor} onReset={() => setBgFillColor('')} />

            {backgroundUrl && (
              <div className="edit-profile__image-controls">
                {/* Превью */}
                <div className="edit-profile__preview-bg" style={{ background: bgFillColor || undefined }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage:    `url(${backgroundUrl})`,
                    backgroundPosition: posStyle(bgPosX, bgPosY),
                    backgroundSize:     sizeStyle(bgScale),
                    backgroundRepeat:   'no-repeat',
                    transform:          rotStyle(bgRotation),
                    filter:             filterStyle(bgBlur),
                    ...edgeMask(bgEdge),
                  }} />
                </div>

                {/* Слайдеры */}
                <div className="edit-profile__sliders">
                  <SliderField label="Влево / Вправо"  value={bgPosX}     onChange={setBgPosX}     min={0}  max={100} unit="%" onReset={() => setBgPosX(BG_DEFAULTS.posX)} />
                  <SliderField label="Вверх / Вниз"    value={bgPosY}     onChange={setBgPosY}     min={0}  max={100} unit="%" onReset={() => setBgPosY(BG_DEFAULTS.posY)} />
                  <SliderField label="Масштаб"          value={bgScale}    onChange={setBgScale}    min={20} max={200} unit="%" onReset={() => setBgScale(BG_DEFAULTS.scale)} />
                  <SliderField label="Поворот"          value={bgRotation} onChange={setBgRotation} min={0}  max={359} unit="°" onReset={() => setBgRotation(BG_DEFAULTS.rotation)} />
                  <SliderField label="Размытие"         value={bgBlur}     onChange={setBgBlur}     min={0}  max={20}  unit="px" onReset={() => setBgBlur(BG_DEFAULTS.blur)} />
                  <SliderField label="Плавность краёв" value={bgEdge}     onChange={setBgEdge}     min={0}  max={100} unit=""   onReset={() => setBgEdge(BG_DEFAULTS.edge)} />
                </div>
              </div>
            )}
          </div>

          {/* ======== СТАТУС ======== */}
          <div className="edit-profile__field">
            <label className="edit-profile__label">
              Статус
              <span className="edit-profile__label-hint">Короткий статус — отображается под именем на странице профиля</span>
            </label>
            <input
              type="text"
              className="edit-profile__input"
              placeholder="Ваш статус..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={STATUS_MAX_LENGTH}
              disabled={saving}
            />
            <span className={`edit-profile__char-count ${bio.length >= STATUS_MAX_LENGTH ? 'edit-profile__char-count--limit' : ''}`}>
              {bio.length} / {STATUS_MAX_LENGTH}
            </span>
          </div>

          {/* ======== UI-ГРУППЫ ======== */}
          <div className="edit-profile__field">
            <label className="edit-profile__label">
              Настройка UI-элементов
              <span className="edit-profile__label-hint">Цвет, рамка, текст и акцент для каждой зоны страницы профиля</span>
            </label>

            <UiGroupField
              title="Шапка профиля"
              hint="Зона под обложкой — аватарка, имя, статус"
              color={headerBgColor}       onColor={setHeaderBgColor}
              alpha={headerBgAlpha}       onAlpha={setHeaderBgAlpha}
              blur={headerBlur}           onBlur={setHeaderBlur}
              borderColor={headerBorderColor}   onBorderColor={setHeaderBorderColor}
              borderWidth={headerBorderWidth}   onBorderWidth={setHeaderBorderWidth}
              borderRadius={headerBorderRadius} onBorderRadius={setHeaderBorderRadius}
              textColor={headerTextColor}       onTextColor={setHeaderTextColor}
              accentColor={headerAccentColor}   onAccentColor={setHeaderAccentColor}
              defaults={HEADER_DEFAULTS}
              disabled={saving}
            />

            <UiGroupField
              title="Область контента"
              hint="Фон за всем контентом вкладок"
              color={contentBgColor}       onColor={setContentBgColor}
              alpha={contentBgAlpha}       onAlpha={setContentBgAlpha}
              blur={contentBlur}           onBlur={setContentBlur}
              borderColor={contentBorderColor}   onBorderColor={setContentBorderColor}
              borderWidth={contentBorderWidth}   onBorderWidth={setContentBorderWidth}
              borderRadius={contentBorderRadius} onBorderRadius={setContentBorderRadius}
              defaults={CONTENT_DEFAULTS}
              disabled={saving}
            />

            <UiGroupField
              title="Карточки и вкладки"
              hint="Вкладки, форма поста, карточки постов и комментарии"
              color={cardsBgColor}       onColor={setCardsBgColor}
              alpha={cardsBgAlpha}       onAlpha={setCardsBgAlpha}
              blur={cardsBlur}           onBlur={setCardsBlur}
              borderColor={cardsBorderColor}   onBorderColor={setCardsBorderColor}
              borderWidth={cardsBorderWidth}   onBorderWidth={setCardsBorderWidth}
              borderRadius={cardsBorderRadius} onBorderRadius={setCardsBorderRadius}
              textColor={cardsTextColor}       onTextColor={setCardsTextColor}
              accentColor={cardsAccentColor}   onAccentColor={setCardsAccentColor}
              defaults={CARDS_DEFAULTS}
              disabled={saving}
            />
          </div>

          {error   && <div className="edit-profile__error">{error}</div>}
          {success && <div className="edit-profile__success">Профиль сохранён! Перенаправление...</div>}

          <div className="edit-profile__actions">
            <button
              type="button"
              className="edit-profile__btn edit-profile__btn--cancel"
              onClick={() => navigate(`/player/${user.username}`)}
              disabled={saving}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="edit-profile__btn edit-profile__btn--save"
              disabled={saving || success}
            >
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>

        </form>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// UiGroupField — полная настройка одного UI-элемента:
//   фон (цвет + прозрачность + размытие), рамка (цвет + ширина + радиус),
//   цвет текста, акцентный цвет (кнопки/ссылки).
// ---------------------------------------------------------------------------
function hexAlphaPreview(hex, alpha) {
  const h = (hex || '#1a1a1a').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${isNaN(r) ? 26 : r}, ${isNaN(g) ? 26 : g}, ${isNaN(b) ? 26 : b}, ${(alpha ?? 95) / 100})`;
}

function UiGroupField({
  title, hint, disabled, defaults,
  color, onColor, alpha, onAlpha, blur, onBlur,
  borderColor, onBorderColor, borderWidth, onBorderWidth, borderRadius, onBorderRadius,
  textColor, onTextColor,
  accentColor, onAccentColor,
}) {
  const [open, setOpen] = useState(false);

  const handleReset = () => {
    onColor(defaults.color);
    onAlpha(defaults.alpha);
    onBlur(defaults.blur);
    onBorderColor(defaults.borderColor ?? '');
    onBorderWidth(defaults.borderWidth ?? 0);
    onBorderRadius(defaults.borderRadius ?? 12);
    if (onTextColor) onTextColor(defaults.textColor ?? '');
    if (onAccentColor) onAccentColor(defaults.accentColor ?? '');
  };

  return (
    <div className="edit-profile__ui-group">
      <button
        type="button"
        className="edit-profile__ui-group-header"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
      >
        <div className="edit-profile__ui-group-preview" style={{ background: hexAlphaPreview(color, alpha) }} />
        <span className="edit-profile__ui-group-title">{title}</span>
        {hint && <span className="edit-profile__ui-group-hint">{hint}</span>}
        <span className="edit-profile__ui-group-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="edit-profile__ui-group-body">

          {/* — Фон — */}
          <p className="edit-profile__ui-section-label">Фон</p>
          <div className="edit-profile__card-bg-row">
            <div className="edit-profile__color-pick">
              <label className="edit-profile__sublabel">Цвет</label>
              <input type="color" className="edit-profile__color-input"
                value={color} onChange={(e) => onColor(e.target.value)} disabled={disabled} />
            </div>
            <div className="edit-profile__slider-group">
              <label className="edit-profile__sublabel">Непрозрачность: {alpha}%</label>
              <input type="range" className="edit-profile__range" min={0} max={100} value={alpha}
                onChange={(e) => onAlpha(Number(e.target.value))} disabled={disabled} />
            </div>
            <div className="edit-profile__slider-group">
              <label className="edit-profile__sublabel">Размытие: {blur}px</label>
              <input type="range" className="edit-profile__range" min={0} max={20} value={blur}
                onChange={(e) => onBlur(Number(e.target.value))} disabled={disabled} />
            </div>
          </div>
          <div className="edit-profile__card-bg-preview" style={{ background: hexAlphaPreview(color, alpha) }} />

          {/* — Рамка — */}
          <p className="edit-profile__ui-section-label">Рамка</p>
          <div className="edit-profile__card-bg-row">
            <div className="edit-profile__color-pick">
              <label className="edit-profile__sublabel">Цвет рамки</label>
              <input type="color" className="edit-profile__color-input"
                value={borderColor || '#2a2a3a'}
                onChange={(e) => onBorderColor(e.target.value)} disabled={disabled} />
              {borderColor && (
                <button type="button" className="edit-profile__reset-btn"
                  onClick={() => onBorderColor('')} disabled={disabled} title="Убрать цвет">✕</button>
              )}
            </div>
            <div className="edit-profile__slider-group">
              <label className="edit-profile__sublabel">Ширина: {borderWidth}px</label>
              <input type="range" className="edit-profile__range" min={0} max={10} value={borderWidth}
                onChange={(e) => onBorderWidth(Number(e.target.value))} disabled={disabled} />
            </div>
            <div className="edit-profile__slider-group">
              <label className="edit-profile__sublabel">Радиус: {borderRadius}px</label>
              <input type="range" className="edit-profile__range" min={0} max={48} value={borderRadius}
                onChange={(e) => onBorderRadius(Number(e.target.value))} disabled={disabled} />
            </div>
          </div>

          {/* — Текст и кнопки — */}
          {(onTextColor !== undefined || onAccentColor !== undefined) && (
            <>
              <p className="edit-profile__ui-section-label">Текст и кнопки</p>
              <div className="edit-profile__card-bg-row">
                {onTextColor !== undefined && (
                  <div className="edit-profile__color-pick">
                    <label className="edit-profile__sublabel">Цвет текста</label>
                    <input type="color" className="edit-profile__color-input"
                      value={textColor || '#cccccc'}
                      onChange={(e) => onTextColor(e.target.value)} disabled={disabled} />
                    {textColor && (
                      <button type="button" className="edit-profile__reset-btn"
                        onClick={() => onTextColor('')} disabled={disabled} title="По умолчанию">✕</button>
                    )}
                    {!textColor && <span className="edit-profile__sublabel" style={{ marginTop: 2 }}>по умолч.</span>}
                  </div>
                )}
                {onAccentColor !== undefined && (
                  <div className="edit-profile__color-pick">
                    <label className="edit-profile__sublabel">Цвет акцента</label>
                    <input type="color" className="edit-profile__color-input"
                      value={accentColor || '#4aff9e'}
                      onChange={(e) => onAccentColor(e.target.value)} disabled={disabled} />
                    {accentColor && (
                      <button type="button" className="edit-profile__reset-btn"
                        onClick={() => onAccentColor('')} disabled={disabled} title="По умолчанию">✕</button>
                    )}
                    {!accentColor && <span className="edit-profile__sublabel" style={{ marginTop: 2 }}>по умолч.</span>}
                  </div>
                )}
                <button
                  type="button"
                  className="edit-profile__btn edit-profile__btn--remove"
                  style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}
                  onClick={handleReset}
                  disabled={disabled}
                >
                  Сбросить всё
                </button>
              </div>
            </>
          )}
          {/* Кнопка сброса для групп без цвета текста */}
          {onTextColor === undefined && onAccentColor === undefined && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="edit-profile__btn edit-profile__btn--remove"
                onClick={handleReset}
                disabled={disabled}
              >
                Сбросить всё
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SliderField — ползунок + значение + кнопка сброса.
// ---------------------------------------------------------------------------
function SliderField({ label, value, onChange, min, max, unit, onReset }) {
  return (
    <div className="edit-profile__slider-row">
      <span className="edit-profile__slider-label">{label}</span>
      <input
        type="range"
        className="edit-profile__slider"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="edit-profile__slider-value">{value}{unit}</span>
      <button type="button" className="edit-profile__reset-btn" onClick={onReset} title="Сбросить">↺</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ColorField — цветовой пикер + кнопка сброса.
// ---------------------------------------------------------------------------
function ColorField({ label, value, onChange, onReset }) {
  return (
    <div className="edit-profile__slider-row">
      <span className="edit-profile__slider-label">{label}</span>
      <div className="edit-profile__color-picker">
        <input
          type="color"
          className="edit-profile__color-input"
          value={value || '#222222'}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="edit-profile__color-value">{value || 'нет'}</span>
      </div>
      <span /> {/* пустая ячейка-значение */}
      <button type="button" className="edit-profile__reset-btn" onClick={onReset} title="Сбросить">↺</button>
    </div>
  );
}

export default EditProfile;
