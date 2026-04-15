// pages/Dashboard/EditProfile.jsx
// Страница редактирования профиля: /dashboard/profile

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../Components/ImageUpload/ImageUpload';
import './EditProfile.scss';

const STATUS_MAX_LENGTH = 100;

// ---------------------------------------------------------------------------
// Хелперы для цвета с alpha-каналом.
// ---------------------------------------------------------------------------
function parseColorVal(str) {
  if (!str) return { hex: '#888888', alpha: 100 };
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]]
      .map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
    const alpha = m[4] !== undefined ? Math.round(parseFloat(m[4]) * 100) : 100;
    return { hex, alpha };
  }
  return { hex: str.startsWith('#') ? str : '#888888', alpha: 100 };
}

function buildColorVal(hex, alpha) {
  if (alpha >= 100) return hex;
  const h = (hex || '#888888').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${(alpha / 100).toFixed(2)})`;
}

// Дефолтные значения параметров изображения — используются при сбросе.
const COVER_DEFAULTS = { posX: 50, posY: 50, scale: 100, rotation: 0, fillColor: '', blur: 0, edge: 0, edgeH: 0, edgeV: 0, containerWidth: 100, aspectW: 4, aspectH: 1 };
const BIO_STYLE_DEFAULTS = { color: '', fontSize: 14, fontWeight: 700 };
const BG_DEFAULTS    = { posX: 50, posY: 50, scale: 100, rotation: 0, fillColor: '', blur: 0, edge: 0, edgeH: 0, edgeV: 0 };
const CARD_BG_DEFAULTS          = { color: '#1a1a1a', alpha: 95, blur: 0 };
const HEADER_DEFAULTS  = {
  color: '#1a1a1a', alpha: 95,  blur: 0,
  borderColor: '',  borderWidth: 0,  borderRadius: 12,
  textColor: '',    accentColor: '',  fontWeight: 700,
};
const CONTENT_DEFAULTS = {
  color: '#0a0a1a', alpha: 0,   blur: 0,
  borderColor: '',  borderWidth: 0,  borderRadius: 10,
  textColor: '',
};
const CARDS_DEFAULTS   = {
  color: '#1a1a1a', alpha: 95,  blur: 0,
  borderColor: '',  borderWidth: 1,  borderRadius: 12,
  textColor: '',    accentColor: '',  fontWeight: 700,
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
  const [coverBlur,           setCoverBlur]           = useState(COVER_DEFAULTS.blur);
  const [coverEdgeH,          setCoverEdgeH]          = useState(COVER_DEFAULTS.edgeH);
  const [coverEdgeV,          setCoverEdgeV]          = useState(COVER_DEFAULTS.edgeV);
  const [coverContainerWidth, setCoverContainerWidth] = useState(COVER_DEFAULTS.containerWidth);
  const [coverAspectW,        setCoverAspectW]        = useState(COVER_DEFAULTS.aspectW);
  const [coverAspectH,        setCoverAspectH]        = useState(COVER_DEFAULTS.aspectH);

  // --- Фон страницы ---
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [bgPosX,        setBgPosX]        = useState(BG_DEFAULTS.posX);
  const [bgPosY,        setBgPosY]        = useState(BG_DEFAULTS.posY);
  const [bgScale,       setBgScale]       = useState(BG_DEFAULTS.scale);
  const [bgRotation,    setBgRotation]    = useState(BG_DEFAULTS.rotation);
  const [bgFillColor,   setBgFillColor]   = useState(BG_DEFAULTS.fillColor);
  const [bgBlur,  setBgBlur]  = useState(BG_DEFAULTS.blur);
  const [bgEdgeH, setBgEdgeH] = useState(BG_DEFAULTS.edgeH);
  const [bgEdgeV, setBgEdgeV] = useState(BG_DEFAULTS.edgeV);

  // --- Статус ---
  const [bio,           setBio]           = useState('');
  const [bioColor,      setBioColor]      = useState(BIO_STYLE_DEFAULTS.color);
  const [bioFontSize,   setBioFontSize]   = useState(BIO_STYLE_DEFAULTS.fontSize);
  const [bioFontWeight, setBioFontWeight] = useState(BIO_STYLE_DEFAULTS.fontWeight);

  // --- Шапка профиля (content_wrapper_*) ---
  const [headerBgColor,      setHeaderBgColor]      = useState(HEADER_DEFAULTS.color);
  const [headerBgAlpha,      setHeaderBgAlpha]      = useState(HEADER_DEFAULTS.alpha);
  const [headerBlur,         setHeaderBlur]         = useState(HEADER_DEFAULTS.blur);
  const [headerBorderColor,  setHeaderBorderColor]  = useState(HEADER_DEFAULTS.borderColor);
  const [headerBorderWidth,  setHeaderBorderWidth]  = useState(HEADER_DEFAULTS.borderWidth);
  const [headerBorderRadius, setHeaderBorderRadius] = useState(HEADER_DEFAULTS.borderRadius);
  const [headerTextColor,    setHeaderTextColor]    = useState(HEADER_DEFAULTS.textColor);
  const [headerAccentColor,  setHeaderAccentColor]  = useState(HEADER_DEFAULTS.accentColor);
  const [headerFontWeight,   setHeaderFontWeight]   = useState(HEADER_DEFAULTS.fontWeight);

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
  const [cardsFontWeight,   setCardsFontWeight]   = useState(CARDS_DEFAULTS.fontWeight);

  // --- Фон карточки (устаревшее, оставлено для совместимости) ---
  const [cardBgColor, setCardBgColor] = useState('#1a1a1a');
  const [cardBgAlpha, setCardBgAlpha] = useState(95);
  const [cardBgBlur,  setCardBgBlur]  = useState(0);

  const [statusOpen, setStatusOpen] = useState(false);

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
      setCoverEdgeH(data.coverEdgeH ?? COVER_DEFAULTS.edgeH);
      setCoverEdgeV(data.coverEdgeV ?? COVER_DEFAULTS.edgeV);
      setCoverContainerWidth(data.coverContainerWidth ?? COVER_DEFAULTS.containerWidth);
      setCoverAspectW(data.coverAspectW ?? COVER_DEFAULTS.aspectW);
      setCoverAspectH(data.coverAspectH ?? COVER_DEFAULTS.aspectH);
      setBackgroundUrl(data.backgroundUrl || '');
      setBgPosX(data.bgPosX ?? BG_DEFAULTS.posX);
      setBgPosY(data.bgPosY ?? BG_DEFAULTS.posY);
      setBgScale(data.bgScale ?? BG_DEFAULTS.scale);
      setBgRotation(data.bgRotation ?? BG_DEFAULTS.rotation);
      setBgFillColor(data.bgFillColor || '');
      setBgBlur(data.bgBlur ?? BG_DEFAULTS.blur);
      setBgEdgeH(data.bgEdgeH ?? BG_DEFAULTS.edgeH);
      setBgEdgeV(data.bgEdgeV ?? BG_DEFAULTS.edgeV);
      setBio(data.bio || '');
      setBioColor(data.bioColor || BIO_STYLE_DEFAULTS.color);
      setBioFontSize(data.bioFontSize ?? BIO_STYLE_DEFAULTS.fontSize);
      setBioFontWeight(data.bioFontWeight ?? BIO_STYLE_DEFAULTS.fontWeight);
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
      setHeaderFontWeight(data.contentWrapperFontWeight ?? HEADER_DEFAULTS.fontWeight);
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
      setCardsFontWeight(data.postCardFontWeight ?? CARDS_DEFAULTS.fontWeight);
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

  // CSS-маска для плавного растворения краёв (раздельно горизонталь/вертикаль).
  const edgeMask = (edgeH, edgeV) => {
    if (!edgeH && !edgeV) return {};
    const pH = edgeH ? Math.round(edgeH * 0.4) : 0;
    const pV = edgeV ? Math.round(edgeV * 0.4) : 0;
    const h = pH > 0 ? `linear-gradient(to right, transparent 0%, black ${pH}%, black ${100 - pH}%, transparent 100%)` : null;
    const v = pV > 0 ? `linear-gradient(to bottom, transparent 0%, black ${pV}%, black ${100 - pV}%, transparent 100%)` : null;
    const maskValue = h && v ? `${h}, ${v}` : (h || v);
    return {
      WebkitMaskImage:     maskValue,
      maskImage:           maskValue,
      ...(h && v ? { WebkitMaskComposite: 'destination-in', maskComposite: 'intersect' } : {}),
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
          bioColor: bioColor || null,
          bioFontSize, bioFontWeight,
          coverPosX, coverPosY, coverScale,
          coverRotation, coverFillColor: coverFillColor || null, coverBlur,
          coverEdgeH, coverEdgeV,
          coverAspectW, coverAspectH,
          bgPosX, bgPosY, bgScale,
          bgRotation, bgFillColor: bgFillColor || null, bgBlur,
          bgEdgeH, bgEdgeV,
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
          contentWrapperFontWeight:   headerFontWeight,
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
          postCardFontWeight:   cardsFontWeight,
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
                <div className="edit-profile__preview-cover" style={{ background: coverFillColor || undefined, aspectRatio: `${coverAspectW}/${coverAspectH}` }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage:    `url(${coverUrl})`,
                    backgroundPosition: posStyle(coverPosX, coverPosY),
                    backgroundSize:     sizeStyle(coverScale),
                    backgroundRepeat:   'no-repeat',
                    transform:          rotStyle(coverRotation),
                    filter:             filterStyle(coverBlur),
                    ...edgeMask(coverEdgeH, coverEdgeV),
                  }} />
                </div>

                {/* Слайдеры */}
                <div className="edit-profile__sliders">
                  <SliderField label="Влево / Вправо"       value={coverPosX}           onChange={setCoverPosX}           min={0}  max={100} unit="%" onReset={() => setCoverPosX(COVER_DEFAULTS.posX)} />
                  <SliderField label="Вверх / Вниз"         value={coverPosY}           onChange={setCoverPosY}           min={0}  max={100} unit="%" onReset={() => setCoverPosY(COVER_DEFAULTS.posY)} />
                  <SliderField label="Масштаб"               value={coverScale}          onChange={setCoverScale}          min={20} max={200} unit="%" onReset={() => setCoverScale(COVER_DEFAULTS.scale)} />
                  <SliderField label="Поворот"               value={coverRotation}       onChange={setCoverRotation}       min={0}  max={359} unit="°" onReset={() => setCoverRotation(COVER_DEFAULTS.rotation)} />
                  <SliderField label="Размытие"              value={coverBlur}           onChange={setCoverBlur}           min={0}  max={20}  unit="px" onReset={() => setCoverBlur(COVER_DEFAULTS.blur)} />
                  <SliderField label="Горизонтальная плавность" value={coverEdgeH} onChange={setCoverEdgeH} min={0} max={100} unit="" onReset={() => setCoverEdgeH(COVER_DEFAULTS.edgeH)} />
                  <SliderField label="Вертикальная плавность"   value={coverEdgeV} onChange={setCoverEdgeV} min={0} max={100} unit="" onReset={() => setCoverEdgeV(COVER_DEFAULTS.edgeV)} />
                  <AspectRatioField
                    w={coverAspectW} h={coverAspectH}
                    onW={setCoverAspectW} onH={setCoverAspectH}
                    onReset={() => { setCoverAspectW(COVER_DEFAULTS.aspectW); setCoverAspectH(COVER_DEFAULTS.aspectH); }}
                  />
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
                    ...edgeMask(bgEdgeH, bgEdgeV),
                  }} />
                </div>

                {/* Слайдеры */}
                <div className="edit-profile__sliders">
                  <SliderField label="Влево / Вправо"           value={bgPosX}     onChange={setBgPosX}     min={0}  max={100} unit="%" onReset={() => setBgPosX(BG_DEFAULTS.posX)} />
                  <SliderField label="Вверх / Вниз"             value={bgPosY}     onChange={setBgPosY}     min={0}  max={100} unit="%" onReset={() => setBgPosY(BG_DEFAULTS.posY)} />
                  <SliderField label="Масштаб"                   value={bgScale}    onChange={setBgScale}    min={20} max={200} unit="%" onReset={() => setBgScale(BG_DEFAULTS.scale)} />
                  <SliderField label="Поворот"                   value={bgRotation} onChange={setBgRotation} min={0}  max={359} unit="°" onReset={() => setBgRotation(BG_DEFAULTS.rotation)} />
                  <SliderField label="Размытие"                  value={bgBlur}     onChange={setBgBlur}     min={0}  max={20}  unit="px" onReset={() => setBgBlur(BG_DEFAULTS.blur)} />
                  <SliderField label="Горизонтальная плавность" value={bgEdgeH}    onChange={setBgEdgeH}    min={0}  max={100} unit=""   onReset={() => setBgEdgeH(BG_DEFAULTS.edgeH)} />
                  <SliderField label="Вертикальная плавность"   value={bgEdgeV}    onChange={setBgEdgeV}    min={0}  max={100} unit=""   onReset={() => setBgEdgeV(BG_DEFAULTS.edgeV)} />
                </div>
              </div>
            )}
          </div>

          {/* ======== СТАТУС ======== */}
          <div className="edit-profile__field">
            <div className="edit-profile__ui-group">
              <button
                type="button"
                className="edit-profile__ui-group-header"
                onClick={() => setStatusOpen(o => !o)}
                disabled={saving}
              >
                <div className="edit-profile__ui-group-preview" style={{ background: bioColor || '#cccccc' }} />
                <span className="edit-profile__ui-group-title">Статус</span>
                <span className="edit-profile__ui-group-hint">Отображается под именем на странице профиля</span>
                <span className="edit-profile__ui-group-arrow">{statusOpen ? '▲' : '▼'}</span>
              </button>

              {statusOpen && (
                <div className="edit-profile__ui-group-body">
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

                  <p className="edit-profile__ui-section-label">Стиль</p>
                  <div className="edit-profile__card-bg-row">
                    <ColorAlphaField
                      label="Цвет текста"
                      value={bioColor}
                      onChange={setBioColor}
                      onReset={() => setBioColor('')}
                      defaultHex="#cccccc"
                      disabled={saving}
                    />
                    <div className="edit-profile__slider-group">
                      <label className="edit-profile__sublabel">Размер: {bioFontSize}px</label>
                      <input type="range" className="edit-profile__range" min={10} max={32} value={bioFontSize}
                        onChange={(e) => setBioFontSize(Number(e.target.value))} disabled={saving} />
                    </div>
                    <div className="edit-profile__slider-group">
                      <label className="edit-profile__sublabel">Жирность: {bioFontWeight}</label>
                      <input type="range" className="edit-profile__range" min={100} max={900} step={100} value={bioFontWeight}
                        onChange={(e) => setBioFontWeight(Number(e.target.value))} disabled={saving} />
                    </div>
                    <button
                      type="button"
                      className="edit-profile__btn edit-profile__btn--remove"
                      style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}
                      onClick={() => { setBioColor(''); setBioFontSize(BIO_STYLE_DEFAULTS.fontSize); setBioFontWeight(BIO_STYLE_DEFAULTS.fontWeight); }}
                      disabled={saving}
                    >
                      Сбросить всё
                    </button>
                  </div>
                </div>
              )}
            </div>
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
              fontWeight={headerFontWeight}     onFontWeight={setHeaderFontWeight}
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
              fontWeight={cardsFontWeight}     onFontWeight={setCardsFontWeight}
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
  fontWeight, onFontWeight,
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
    if (onFontWeight) onFontWeight(defaults.fontWeight ?? 400);
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
              <label className="edit-profile__sublabel">Прозрачность: {100 - alpha}%</label>
              <input type="range" className="edit-profile__range" min={0} max={100} value={100 - alpha}
                onChange={(e) => onAlpha(100 - Number(e.target.value))} disabled={disabled} />
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
            <ColorAlphaField
              label="Цвет рамки"
              value={borderColor}
              onChange={onBorderColor}
              onReset={() => onBorderColor('')}
              defaultHex="#2a2a3a"
              disabled={disabled}
            />
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
          {(onTextColor !== undefined || onAccentColor !== undefined || onFontWeight !== undefined) && (
            <>
              <p className="edit-profile__ui-section-label">Текст и кнопки</p>
              <div className="edit-profile__card-bg-row">
                {onTextColor !== undefined && (
                  <ColorAlphaField
                    label="Цвет текста"
                    value={textColor}
                    onChange={onTextColor}
                    onReset={() => onTextColor('')}
                    defaultHex="#cccccc"
                    disabled={disabled}
                  />
                )}
                {onAccentColor !== undefined && (
                  <ColorAlphaField
                    label="Цвет акцента"
                    value={accentColor}
                    onChange={onAccentColor}
                    onReset={() => onAccentColor('')}
                    defaultHex="#4aff9e"
                    disabled={disabled}
                  />
                )}
                {onFontWeight !== undefined && (
                  <div className="edit-profile__slider-group">
                    <label className="edit-profile__sublabel">Жирность: {fontWeight}</label>
                    <input type="range" className="edit-profile__range" min={100} max={900} step={100}
                      value={fontWeight}
                      onChange={(e) => onFontWeight(Number(e.target.value))} disabled={disabled} />
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
          {onTextColor === undefined && onAccentColor === undefined && onFontWeight === undefined && (
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
function SliderField({ label, value, onChange, min, max, step, unit, onReset }) {
  return (
    <div className="edit-profile__slider-row">
      <span className="edit-profile__slider-label">{label}</span>
      <input
        type="range"
        className="edit-profile__slider"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="edit-profile__slider-value">{value}{unit}</span>
      <button type="button" className="edit-profile__reset-btn" onClick={onReset} title="Сбросить">↺</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ColorField — цветовой пикер + alpha + кнопка сброса (для строки слайдера).
// ---------------------------------------------------------------------------
function ColorField({ label, value, onChange, onReset }) {
  const { hex, alpha } = parseColorVal(value || '');
  const effectiveHex = value ? hex : '#222222';
  return (
    <div className="edit-profile__slider-row edit-profile__slider-row--color">
      <span className="edit-profile__slider-label">{label}</span>
      <div className="edit-profile__color-picker">
        <input
          type="color"
          className="edit-profile__color-input"
          value={effectiveHex}
          onChange={(e) => onChange(buildColorVal(e.target.value, alpha))}
        />
        <span className="edit-profile__color-value">{value || 'нет'}</span>
      </div>
      <div className="edit-profile__color-alpha-inline">
        <span className="edit-profile__sublabel">Прозрачность: {100 - alpha}%</span>
        <input type="range" className="edit-profile__range" min={0} max={100} value={100 - alpha}
          onChange={(e) => onChange(buildColorVal(effectiveHex, 100 - Number(e.target.value)))} />
      </div>
      <button type="button" className="edit-profile__reset-btn" onClick={onReset} title="Сбросить">↺</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ColorAlphaField — компактный пикер цвета + alpha для UI-групп.
// ---------------------------------------------------------------------------
function ColorAlphaField({ label, value, onChange, onReset, disabled, defaultHex = '#888888' }) {
  const { hex, alpha } = parseColorVal(value || '');
  const effectiveHex = value ? hex : defaultHex;
  return (
    <div className="edit-profile__color-pick">
      <label className="edit-profile__sublabel">{label}</label>
      <div className="edit-profile__color-alpha-row">
        <input type="color" className="edit-profile__color-input"
          value={effectiveHex}
          onChange={(e) => onChange(buildColorVal(e.target.value, alpha))}
          disabled={disabled} />
        {value ? (
          <button type="button" className="edit-profile__reset-btn"
            onClick={onReset} disabled={disabled} title="Убрать">✕</button>
        ) : (
          <span className="edit-profile__sublabel" style={{ marginTop: 2 }}>по умолч.</span>
        )}
      </div>
      <div className="edit-profile__slider-group" style={{ marginTop: 4 }}>
        <label className="edit-profile__sublabel">Прозрачность: {100 - alpha}%</label>
        <input type="range" className="edit-profile__range" min={0} max={100} value={100 - alpha}
          onChange={(e) => onChange(buildColorVal(effectiveHex, 100 - Number(e.target.value)))}
          disabled={disabled} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AspectRatioField — два числовых поля «W : H» для соотношения сторон.
// ---------------------------------------------------------------------------
function AspectRatioField({ w, h, onW, onH, onReset }) {
  const handleW = (e) => {
    const v = Math.max(1, Math.min(32, parseInt(e.target.value) || 1));
    onW(v);
  };
  const handleH = (e) => {
    const v = Math.max(1, Math.min(32, parseInt(e.target.value) || 1));
    onH(v);
  };
  return (
    <div className="edit-profile__slider-row">
      <span className="edit-profile__slider-label">Соотношение сторон</span>
      <div className="edit-profile__aspect-row">
        <input type="number" className="edit-profile__aspect-input" min={1} max={32} value={w} onChange={handleW} />
        <span className="edit-profile__aspect-sep">:</span>
        <input type="number" className="edit-profile__aspect-input" min={1} max={32} value={h} onChange={handleH} />
        <span className="edit-profile__aspect-preview">({(w/h).toFixed(2)}:1)</span>
      </div>
      <span />
      <button type="button" className="edit-profile__reset-btn" onClick={onReset} title="Сбросить">↺</button>
    </div>
  );
}

export default EditProfile;
