// Components/RichTextEditor/RichTextEditor.jsx
// Лёгкий WYSIWYG-редактор на базе contentEditable + execCommand.
//
// Props:
//   value          — HTML-строка (контролируемый режим)
//   onChange(html) — колбэк при изменении содержимого
//   onUploadImage  — async fn, получает File → возвращает { url, fileType? }
//   onCreatePoll   — async fn, получает pollData → { id }; опционально (только в NewsCreate)
//   allPlayers     — массив { name, uuid, ... } из PlayerContext; опционально
//   placeholder    — подсказка при пустом содержимом

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PollBuilder from '../PollBuilder/PollBuilder';
import { showConfirm } from '../Dialog/dialogManager';
import './RichTextEditor.scss';

const MARKER_STYLE =
  'background:rgba(74,255,158,0.07);border:1px solid rgba(74,255,158,0.25);' +
  'border-radius:8px;padding:10px 14px;margin:12px 0;color:#4aff9e;' +
  'font-size:0.9rem;cursor:default;display:block;';

// Стиль для кликабельных маркеров (слайдер, список игроков) — добавляем pointer и hover-подсветку
const EDITABLE_MARKER_STYLE =
  'background:rgba(74,255,158,0.07);border:1px solid rgba(74,255,158,0.25);' +
  'border-radius:8px;padding:10px 14px;margin:12px 0;color:#4aff9e;' +
  'font-size:0.9rem;cursor:pointer;display:block;user-select:none;';

// activeKey  — ключ в объекте activeFormats (для toggle-команд)
// activeBlock — значение activeFormats.block (для formatBlock-команд)
const TOOLBAR = [
  { cmd: 'bold',               label: 'B',      title: 'Жирный (Ctrl+B)',                    cls: 'rte__btn--bold',   activeKey: 'bold' },
  { cmd: 'italic',             label: 'I',      title: 'Курсив (Ctrl+I)',                    cls: 'rte__btn--italic', activeKey: 'italic' },
  { type: 'sep' },
  { cmd: 'formatBlock', arg: 'h2',     label: 'H2', title: 'Заголовок 2', activeBlock: 'h2' },
  { cmd: 'formatBlock', arg: 'h3',     label: 'H3', title: 'Заголовок 3', activeBlock: 'h3' },
  { cmd: 'formatBlock', arg: 'h4',     label: 'H4', title: 'Заголовок 4', activeBlock: 'h4' },
  { cmd: 'formatBlock', arg: 'p',      label: '¶',  title: 'Обычный текст', activeBlock: 'p' },
  { type: 'sep' },
  { cmd: 'formatBlock', arg: 'blockquote', label: '❝', title: 'Цитата (click ещё раз — выйти)', activeBlock: 'blockquote' },
  { cmd: 'insertUnorderedList', label: '•—', title: 'Маркированный список (повтор — выйти)', activeKey: 'ul' },
  { cmd: 'insertOrderedList',   label: '1.', title: 'Нумерованный список (повтор — выйти)',  activeKey: 'ol' },
  { type: 'sep' },
  { cmd: 'insertHR',    label: '—',     title: 'Горизонтальная линия' },
  { cmd: 'createLink',  label: '🔗',    title: 'Гиперссылка', activeKey: 'link' },
  { cmd: 'insertImage', label: 'Медиа', title: 'Вставить изображение или видео' },
  { cmd: 'insertVideo', label: 'URL',   title: 'Вставить видео по URL (YouTube, mp4...)' },
  { type: 'sep' },
  { cmd: 'alignLeft',   label: '⬅',    title: 'По левому краю' },
  { cmd: 'alignCenter', label: '⬛',    title: 'По центру' },
  { cmd: 'alignRight',  label: '➡',    title: 'По правому краю' },
  { type: 'sep' },
  { cmd: 'insertSlider',     label: '🎠',  title: 'Вставить слайдер (карусель изображений/видео)' },
  { cmd: 'insertImageRow',   label: '🖼️', title: 'Вставить ряд изображений (несколько рядом)' },
  { cmd: 'insertPlayerList', label: '👥', title: 'Вставить список игроков' },
  { type: 'sep' },
  { cmd: 'insertPoll',  label: '📊',   title: 'Вставить опрос' },
];

function pluralFiles(n) {
  if (n === 1) return 'файл';
  if (n >= 2 && n <= 4) return 'файла';
  return 'файлов';
}

// Возвращает true если узел является «изолированным блоком»:
// маркер (contenteditable="false"), video, iframe, или параграф
// содержащий единственный медиа-элемент (img/video/iframe).
function isIsolatedBlock(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = node.tagName.toLowerCase();
  if (node.getAttribute('contenteditable') === 'false') return true;
  if (tag === 'video' || tag === 'iframe') return true;
  if (tag === 'p' || tag === 'div') {
    const meaningful = [...node.childNodes].filter(
      n => !(n.nodeType === Node.TEXT_NODE && n.textContent.trim() === '')
    );
    if (meaningful.length === 1) {
      const ct = meaningful[0].tagName?.toLowerCase();
      if (ct === 'img' || ct === 'video' || ct === 'iframe') return true;
    }
  }
  return false;
}

// Гарантирует наличие <p><br></p> вокруг каждого изолированного блока
// (маркеры, video, iframe, параграфы с единственным медиа-элементом).
// Без этого браузер не может поставить курсор между ними,
// а Backspace удаляет несколько блоков одновременно.
function ensureMarkerSeparators(el) {
  for (const child of [...el.childNodes]) {
    if (!isIsolatedBlock(child)) continue;
    if (!child.previousSibling || isIsolatedBlock(child.previousSibling)) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      child.before(p);
    }
    if (!child.nextSibling || isIsolatedBlock(child.nextSibling)) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      child.after(p);
    }
  }
}

// onCreatePoll(pollData) → { id } — пробрасывается из NewsCreate; если не передан — кнопка недоступна
// allPlayers — массив игроков; если не передан — кнопка 👥 недоступна
function RichTextEditor({ value, onChange, onUploadImage, onCreatePoll, allPlayers, placeholder = 'Начните писать...' }) {
  const rteRef    = useRef(null);
  const editorRef = useRef(null);
  const fileRef   = useRef(null);
  const sliderFileRef    = useRef(null);
  const imageRowFileRef  = useRef(null);

  const [uploading,            setUploading]            = useState(false);
  const [activeFormats,        setActiveFormats]        = useState({});
  const [mediaSelected,        setMediaSelected]        = useState(false);
  const [mediaWidthInput, setMediaWidthInput] = useState('400');
  const [showPollBuilder, setShowPollBuilder] = useState(false);

  // Слайдер-модал
  const [showSliderModal,   setShowSliderModal]   = useState(false);
  const [sliderFiles,       setSliderFiles]       = useState([]); // [{file, previewUrl, isVideo}]
  const [sliderUploading,   setSliderUploading]   = useState(false);

  // Ряд изображений-модал
  const [showImageRowModal,  setShowImageRowModal]  = useState(false);
  const [imageRowFiles,      setImageRowFiles]      = useState([]);
  const [imageRowUploading,  setImageRowUploading]  = useState(false);

  // Модал списка игроков
  const [showPlayerModal,       setShowPlayerModal]       = useState(false);
  const [playerSearch,          setPlayerSearch]          = useState('');
  const [selectedPlayerNames,   setSelectedPlayerNames]   = useState([]);

  const activeFormatsRef          = useRef({});
  const selectedMediaRef          = useRef(null);
  const isFocusedRef              = useRef(false);
  const editingSliderMarkerRef    = useRef(null);
  const editingPlayerMarkerRef    = useRef(null);
  const editingImageRowMarkerRef  = useRef(null);

  // ── Инициализация ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== (value || '')) {
      el.innerHTML = value || '';
      ensureMarkerSeparators(el); // Гарантируем параграфы-разделители сразу при загрузке
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // только при монтировании

  // При изменении value снаружи (загрузка для редактирования)
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      const el = editorRef.current;
      if (el && el.innerHTML !== value) {
        el.innerHTML = value || '';
        ensureMarkerSeparators(el); // Гарантируем параграфы-разделители при обновлении
      }
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    ensureMarkerSeparators(el);
    const html = el.innerHTML || '';
    onChange?.(html);
  }, [onChange]);

  // ── Active state ───────────────────────────────────────────────────────────
  const updateActiveFormats = useCallback(() => {
    try {
      const raw   = document.queryCommandValue('formatBlock');
      const block = raw.toLowerCase().replace(/^<|>$/g, '') || 'p';
      const formats = {
        bold:   document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        block,
        ul:     document.queryCommandState('insertUnorderedList'),
        ol:     document.queryCommandState('insertOrderedList'),
        link:   !!window.getSelection()?.anchorNode?.parentElement?.closest('a'),
      };
      activeFormatsRef.current = formats;
      setActiveFormats(formats);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      if (isFocusedRef.current) updateActiveFormats();
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [updateActiveFormats]);

  const isButtonActive = (item) => {
    if (item.activeKey)   return !!activeFormats[item.activeKey];
    if (item.activeBlock) return activeFormats.block === item.activeBlock;
    return false;
  };

  // ── Selection save/restore ─────────────────────────────────────────────────
  const savedRangeRef = useRef(null);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const exec = useCallback((cmd, arg) => {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg ?? null);
    handleInput();
  }, [restoreSelection, handleInput]);

  // Проставляет target="_blank" всем ссылкам в редакторе
  const setAllLinksBlank = useCallback(() => {
    editorRef.current?.querySelectorAll('a').forEach(a => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }, []);

  // ── Выравнивание ──────────────────────────────────────────────────────────
  // Для медиа используем margin (НЕ float!), чтобы изображение оставалось
  // в своей строке и не утягивало следующие элементы в тот же ряд.
  const handleAlign = useCallback((direction) => {
    const el = selectedMediaRef.current;
    if (el) {
      // Сбрасываем float и inline перед любым выравниванием
      el.style.float         = 'none';
      el.style.display       = 'block';
      el.style.verticalAlign = '';

      if (direction === 'left') {
        el.style.marginLeft   = '0';
        el.style.marginRight  = 'auto';
        el.style.marginTop    = '12px';
        el.style.marginBottom = '12px';
        el.style.maxWidth     = '';
      } else if (direction === 'right') {
        el.style.marginLeft   = 'auto';
        el.style.marginRight  = '0';
        el.style.marginTop    = '12px';
        el.style.marginBottom = '12px';
        el.style.maxWidth     = '';
      } else {
        // center
        el.style.marginLeft   = 'auto';
        el.style.marginRight  = 'auto';
        el.style.marginTop    = '12px';
        el.style.marginBottom = '12px';
        el.style.maxWidth     = '';
      }
      handleInput();
    } else {
      // Выравниваем текстовый блок
      const cmdMap = {
        left:   'justifyLeft',
        center: 'justifyCenter',
        right:  'justifyRight',
      };
      if (cmdMap[direction]) exec(cmdMap[direction]);
    }
  }, [handleInput, exec]);

  // ── Вставить абзац выше / ниже выбранного медиа ────────────────────────────
  // Если параграф-разделитель уже есть — просто ставим туда курсор.
  // Если нет — создаём новый.
  const insertParagraphAround = useCallback((position) => {
    const el = selectedMediaRef.current;
    if (!el) return;
    let target;
    if (position === 'before') {
      const prev = el.previousSibling;
      if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.tagName === 'P') {
        target = prev;
      } else {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        el.before(p);
        target = p;
      }
    } else {
      const next = el.nextSibling;
      if (next && next.nodeType === Node.ELEMENT_NODE && next.tagName === 'P') {
        target = next;
      } else {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        el.after(p);
        target = p;
      }
    }
    // Ставим курсор в найденный/созданный параграф
    const range = document.createRange();
    range.setStart(target, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    editorRef.current?.focus({ preventScroll: true });
    handleInput();
  }, [handleInput]);

  // ── Клики по тулбару ───────────────────────────────────────────────────────
  const handleToolbarClick = useCallback(async (item, e) => {
    e.preventDefault();

    if (item.cmd === 'alignLeft')   { handleAlign('left');   return; }
    if (item.cmd === 'alignCenter') { handleAlign('center'); return; }
    if (item.cmd === 'alignRight')  { handleAlign('right');  return; }

    if (item.cmd === 'insertPoll') {
      if (!onCreatePoll) return;
      saveSelection();
      setShowPollBuilder(true);
      return;
    }

    if (item.cmd === 'insertSlider') {
      saveSelection();
      setShowSliderModal(true);
      return;
    }

    if (item.cmd === 'insertImageRow') {
      saveSelection();
      setShowImageRowModal(true);
      return;
    }

    if (item.cmd === 'insertPlayerList') {
      if (!allPlayers) return;
      saveSelection();
      setShowPlayerModal(true);
      return;
    }

    if (item.cmd === 'insertImage') {
      fileRef.current?.click();
      return;
    }

    if (item.cmd === 'insertHR') {
      restoreSelection();
      editorRef.current?.focus();
      document.execCommand('insertHorizontalRule', false);
      handleInput();
      return;
    }

    if (item.cmd === 'insertVideo') {
      const url = prompt('Ссылка на видео (YouTube, mp4 и т.п.):');
      if (!url) return;
      restoreSelection();
      editorRef.current?.focus();
      const html = buildVideoHtml(url);
      // Фикс: после <video> браузер не создаёт текстовый узел → добавляем абзац
      const needsCursorFix = html.startsWith('<video');
      document.execCommand('insertHTML', false, html + (needsCursorFix ? '<p><br></p>' : ''));
      handleInput();
      return;
    }

    if (item.cmd === 'createLink') {
      restoreSelection();
      const sel = window.getSelection();
      const linkEl = sel?.anchorNode?.parentElement?.closest('a');
      if (linkEl) {
        const newUrl = prompt('URL ссылки (очистите — удалить):', linkEl.href);
        if (newUrl === null) return;
        editorRef.current?.focus();
        if (newUrl.trim() === '') {
          document.execCommand('unlink', false);
        } else {
          document.execCommand('createLink', false, newUrl.trim());
          setAllLinksBlank();
        }
      } else {
        const sel2 = window.getSelection();
        if (!sel2 || sel2.isCollapsed) {
          alert('Выделите текст, чтобы создать ссылку');
          return;
        }
        const url = prompt('Введите URL:');
        if (!url || !url.trim()) return;
        editorRef.current?.focus();
        document.execCommand('createLink', false, url.trim());
        setAllLinksBlank();
      }
      handleInput();
      return;
    }

    // Blockquote: повторный клик — выходим в <p>
    if (item.cmd === 'formatBlock' && item.arg === 'blockquote' &&
        activeFormatsRef.current.block === 'blockquote') {
      exec('formatBlock', 'p');
      return;
    }

    exec(item.cmd, item.arg);
  }, [exec, restoreSelection, handleInput, setAllLinksBlank, onCreatePoll, saveSelection, allPlayers, handleAlign]);

  // ── Poll ───────────────────────────────────────────────────────────────────
  const handlePollConfirm = useCallback(async (pollData) => {
    setShowPollBuilder(false);
    if (!onCreatePoll) return;
    try {
      const result = await onCreatePoll(pollData);
      if (result?.id) {
        restoreSelection();
        editorRef.current?.focus();
        const marker = `<div class="rte-poll-marker" contenteditable="false" data-poll-id="${result.id}" style="${MARKER_STYLE}">📊 Опрос: ${pollData.question}</div><p><br></p>`;
        document.execCommand('insertHTML', false, marker);
        handleInput();
      }
    } catch (err) {
      alert('Ошибка при создании опроса: ' + (err.message || ''));
    }
  }, [onCreatePoll, restoreSelection, handleInput]);

  // ── Загрузка медиа-файла (кнопка «Медиа») ─────────────────────────────────
  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadImage) return;

    setUploading(true);
    try {
      const result  = await onUploadImage(file);
      const url     = result.url;
      const isVideo = file.type.startsWith('video/') || result.fileType?.startsWith('video/');

      restoreSelection();
      editorRef.current?.focus();

      // Фикс: после <video> браузер не создаёт пустой текстовый узел → добавляем <p><br>
      const html = isVideo
        ? `<video src="${url}" controls style="width:400px;height:auto;display:block;margin:12px 0;"></video><p><br></p>`
        : `<img src="${url}" alt="" style="width:400px;height:auto;" />`;

      document.execCommand('insertHTML', false, html);
      handleInput();
    } catch (err) {
      alert('Ошибка загрузки: ' + (err.message || 'неизвестная ошибка'));
    } finally {
      setUploading(false);
    }
  }, [onUploadImage, restoreSelection, handleInput]);

  // ── Слайдер-модал ─────────────────────────────────────────────────────────
  const handleSliderFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    const items = files.map(f => ({
      file: f,
      isExisting: false,
      isVideo: f.type.startsWith('video/'),
      previewUrl: (f.type.startsWith('image/') || f.type.startsWith('video/'))
        ? URL.createObjectURL(f)
        : null,
    }));
    setSliderFiles(prev => [...prev, ...items]);
    e.target.value = '';
  }, []);

  const closeSliderModal = useCallback(() => {
    setSliderFiles(prev => {
      prev.forEach(f => !f.isExisting && f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      return [];
    });
    editingSliderMarkerRef.current = null;
    setShowSliderModal(false);
  }, []);

  const handleSliderInsert = useCallback(async () => {
    if (!sliderFiles.length) return;
    const hasNewFiles = sliderFiles.some(f => !f.isExisting);
    if (hasNewFiles && !onUploadImage) return;
    setSliderUploading(true);
    try {
      const uploaded = [];
      for (const item of sliderFiles) {
        if (item.isExisting) {
          uploaded.push({ url: item.existingUrl, fileType: item.existingFileType });
        } else {
          const result = await onUploadImage(item.file);
          uploaded.push({ url: result.url, fileType: result.fileType || item.file.type });
        }
      }
      const encoded = encodeURIComponent(JSON.stringify(uploaded));
      const preview = `🎠 Слайдер: ${uploaded.length} ${pluralFiles(uploaded.length)}`;

      if (editingSliderMarkerRef.current) {
        const el = editingSliderMarkerRef.current;
        el.setAttribute('data-images', encoded);
        el.textContent = preview;
        editingSliderMarkerRef.current = null;
        handleInput();
      } else {
        const marker = `<div class="rte-slider" contenteditable="false" data-images="${encoded}" style="${EDITABLE_MARKER_STYLE}">${preview}</div><p><br></p>`;
        restoreSelection();
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, marker);
        handleInput();
      }
      closeSliderModal();
    } catch (err) {
      alert('Ошибка загрузки: ' + (err.message || ''));
    } finally {
      setSliderUploading(false);
    }
  }, [sliderFiles, onUploadImage, restoreSelection, handleInput, closeSliderModal]);

  // ── Ряд изображений ───────────────────────────────────────────────────────
  const handleImageRowFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    const items = files.map(f => ({
      file: f,
      isExisting: false,
      isVideo: f.type.startsWith('video/'),
      previewUrl: (f.type.startsWith('image/') || f.type.startsWith('video/'))
        ? URL.createObjectURL(f)
        : null,
    }));
    setImageRowFiles(prev => [...prev, ...items]);
    e.target.value = '';
  }, []);

  const closeImageRowModal = useCallback(() => {
    setImageRowFiles(prev => {
      prev.forEach(f => !f.isExisting && f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      return [];
    });
    editingImageRowMarkerRef.current = null;
    setShowImageRowModal(false);
  }, []);

  const handleImageRowInsert = useCallback(async () => {
    if (!imageRowFiles.length) return;
    const hasNew = imageRowFiles.some(f => !f.isExisting);
    if (hasNew && !onUploadImage) return;
    setImageRowUploading(true);
    try {
      const uploaded = [];
      for (const item of imageRowFiles) {
        if (item.isExisting) {
          uploaded.push({ url: item.existingUrl, fileType: item.existingFileType });
        } else {
          const result = await onUploadImage(item.file);
          uploaded.push({ url: result.url, fileType: result.fileType || item.file.type });
        }
      }
      const encoded = encodeURIComponent(JSON.stringify(uploaded));
      const preview = `🖼️ Ряд: ${uploaded.length} ${pluralFiles(uploaded.length)}`;

      if (editingImageRowMarkerRef.current) {
        const el = editingImageRowMarkerRef.current;
        el.setAttribute('data-images', encoded);
        el.textContent = preview;
        editingImageRowMarkerRef.current = null;
        handleInput();
      } else {
        const marker = `<div class="rte-image-row" contenteditable="false" data-images="${encoded}" style="${EDITABLE_MARKER_STYLE}">${preview}</div><p><br></p>`;
        restoreSelection();
        editorRef.current?.focus({ preventScroll: true });
        document.execCommand('insertHTML', false, marker);
        handleInput();
      }
      closeImageRowModal();
    } catch (err) {
      alert('Ошибка загрузки: ' + (err.message || ''));
    } finally {
      setImageRowUploading(false);
    }
  }, [imageRowFiles, onUploadImage, restoreSelection, handleInput, closeImageRowModal]);

  // ── Модал списка игроков ──────────────────────────────────────────────────
  const filteredPlayers = useMemo(() => {
    if (!allPlayers) return [];
    if (!playerSearch.trim()) return allPlayers;
    const q = playerSearch.toLowerCase();
    return allPlayers.filter(p => p.name.toLowerCase().includes(q));
  }, [allPlayers, playerSearch]);

  const togglePlayer = useCallback((name) => {
    setSelectedPlayerNames(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  }, []);

  const closePlayerModal = useCallback(() => {
    setSelectedPlayerNames([]);
    setPlayerSearch('');
    editingPlayerMarkerRef.current = null;
    setShowPlayerModal(false);
  }, []);

  const handlePlayerListInsert = useCallback(() => {
    const players = (allPlayers || [])
      .filter(p => selectedPlayerNames.includes(p.name))
      .map(p => ({ name: p.name, uuid: p.uuid || '' }));
    if (!players.length) return;

    const encoded = encodeURIComponent(JSON.stringify(players));
    const names   = players.map(p => p.name).join(', ');
    const preview = `👥 Игроки: ${names}`;

    if (editingPlayerMarkerRef.current) {
      const el = editingPlayerMarkerRef.current;
      el.setAttribute('data-players', encoded);
      el.textContent = preview;
      editingPlayerMarkerRef.current = null;
      handleInput();
    } else {
      const marker = `<div class="rte-player-list" contenteditable="false" data-players="${encoded}" style="${EDITABLE_MARKER_STYLE}">${preview}</div><p><br></p>`;
      restoreSelection();
      editorRef.current?.focus();
      document.execCommand('insertHTML', false, marker);
      handleInput();
    }
    closePlayerModal();
  }, [allPlayers, selectedPlayerNames, restoreSelection, handleInput, closePlayerModal]);

  // ── Выбор / снятие выбора медиа-элемента ─────────────────────────────────
  const selectMedia = useCallback((el) => {
    if (selectedMediaRef.current) {
      selectedMediaRef.current.classList.remove('rte-selected');
    }
    selectedMediaRef.current = el;
    el.classList.add('rte-selected');
    setMediaSelected(true);
    const w = el.style.width || '400px';
    setMediaWidthInput(w.endsWith('px') ? w.slice(0, -2) : '');
  }, []);

  const deselectMedia = useCallback(() => {
    if (selectedMediaRef.current) {
      selectedMediaRef.current.classList.remove('rte-selected');
      selectedMediaRef.current = null;
    }
    setMediaSelected(false);
  }, []);

  // ── Клик по медиа в редакторе ─────────────────────────────────────────────
  const handleEditorClick = useCallback((e) => {
    // Редактирование слайдера по клику на маркер
    const sliderMarker = e.target.closest?.('.rte-slider');
    if (sliderMarker) {
      const encoded = sliderMarker.getAttribute('data-images');
      let existing = [];
      try { existing = JSON.parse(decodeURIComponent(encoded)); } catch {}
      const items = existing.map(({ url, fileType }) => ({
        file: null,
        isExisting: true,
        existingUrl: url,
        existingFileType: fileType,
        isVideo: fileType?.startsWith('video/') || false,
        previewUrl: url,
      }));
      editingSliderMarkerRef.current = sliderMarker;
      setSliderFiles(items);
      setShowSliderModal(true);
      return;
    }

    // Редактирование ряда изображений по клику на маркер
    const imageRowMarker = e.target.closest?.('.rte-image-row');
    if (imageRowMarker) {
      const encoded = imageRowMarker.getAttribute('data-images');
      let existing = [];
      try { existing = JSON.parse(decodeURIComponent(encoded)); } catch {}
      const items = existing.map(({ url, fileType }) => ({
        file: null,
        isExisting: true,
        existingUrl: url,
        existingFileType: fileType,
        isVideo: fileType?.startsWith('video/') || false,
        previewUrl: url,
      }));
      editingImageRowMarkerRef.current = imageRowMarker;
      setImageRowFiles(items);
      setShowImageRowModal(true);
      return;
    }

    // Редактирование списка игроков по клику на маркер
    const playerMarker = e.target.closest?.('.rte-player-list');
    if (playerMarker) {
      if (!allPlayers) return;
      const encoded = playerMarker.getAttribute('data-players');
      let players = [];
      try { players = JSON.parse(decodeURIComponent(encoded)); } catch {}
      editingPlayerMarkerRef.current = playerMarker;
      setSelectedPlayerNames(players.map(p => p.name));
      setPlayerSearch('');
      setShowPlayerModal(true);
      return;
    }

    const tag = e.target.tagName.toLowerCase();
    if (tag === 'video') {
      e.preventDefault();
      return;
    }
    if (tag === 'img') {
      selectMedia(e.target);
      return;
    }
    if (tag === 'a') {
      e.preventDefault();
      deselectMedia();
      return;
    }
    const editor = editorRef.current;
    if (editor) {
      const x = e.clientX, y = e.clientY;
      for (const iframe of editor.querySelectorAll('iframe')) {
        const r = iframe.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return;
      }
    }
    deselectMedia();
  }, [selectMedia, deselectMedia, allPlayers]);

  const handleEditorMouseDown = useCallback((e) => {
    const tag = e.target.tagName.toLowerCase();

    if (tag === 'video') {
      e.preventDefault();
      // preventScroll — не прыгаем наверх при клике на видео
      editorRef.current?.focus({ preventScroll: true });
      selectMedia(e.target);
      return;
    }

    const x = e.clientX, y = e.clientY;
    const iframes = editorRef.current?.querySelectorAll('iframe') ?? [];
    for (const iframe of iframes) {
      const r = iframe.getBoundingClientRect();
      // Небольшой отступ (4px) — iframe иногда теряет несколько пикселей из-за border/outline
      if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) {
        e.preventDefault();
        editorRef.current?.focus({ preventScroll: true });
        selectMedia(iframe);
        return;
      }
    }
  }, [selectMedia]);

  const resizeMedia = useCallback((width) => {
    const el = selectedMediaRef.current;
    if (!el) return;
    el.style.width  = width;
    el.style.height = 'auto';
    handleInput();
  }, [handleInput]);

  const deleteMedia = useCallback(() => {
    const el = selectedMediaRef.current;
    if (!el) return;
    el.remove();
    selectedMediaRef.current = null;
    setMediaSelected(false);
    handleInput();
  }, [handleInput]);

  // ── Enter в заголовках → <p> ───────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const block = sel.anchorNode?.parentElement?.closest('h2,h3,h4,blockquote');
      if (block) {
        e.preventDefault();
        document.execCommand('insertParagraph', false);
        document.execCommand('formatBlock', false, 'p');
        handleInput();
      }
      return;
    }

    // Блокируем случайное удаление медиа и маркеров через Backspace/Delete.
    // Удаление доступно только через кнопку «Удалить» в модальном окне.
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const sel = window.getSelection();
      if (!sel?.isCollapsed) return; // многосимвольное выделение — не мешаем
      const node   = sel.anchorNode;
      const offset = sel.anchorOffset;

      // Найти ближайший блочный родитель (p, div, h*, blockquote, li)
      let block = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      while (block && block !== editorRef.current &&
             !['P','DIV','H2','H3','H4','BLOCKQUOTE','LI'].includes(block?.tagName)) {
        block = block?.parentElement;
      }
      if (!block || block === editorRef.current) return;

      if (e.key === 'Backspace') {
        const atStart = offset === 0;
        if (atStart && isIsolatedBlock(block.previousSibling)) {
          e.preventDefault();
        }
      } else {
        const len = node.nodeType === Node.TEXT_NODE ? node.length : node.childNodes.length;
        const atEnd = offset === len;
        if (atEnd && isIsolatedBlock(block.nextSibling)) {
          e.preventDefault();
        }
      }
    }
  }, [handleInput]);

  // ── Рендер ─────────────────────────────────────────────────────────────────
  return (
    <div className="rte" ref={rteRef}>

      {/* Sticky-обёртка: тулбар + медиа-бар приклеиваются вместе */}
      <div className="rte__sticky-header">

        {/* Главный тулбар */}
        <div className="rte__toolbar">
          {TOOLBAR.map((item, i) => {
            if (item.type === 'sep') {
              return <span key={i} className="rte__sep" />;
            }
            const active   = isButtonActive(item);
            const disabled =
              (uploading && item.cmd === 'insertImage') ||
              (item.cmd === 'insertPlayerList' && !allPlayers) ||
              (item.cmd === 'insertPoll' && !onCreatePoll);

            return (
              <button
                key={i}
                type="button"
                className={`rte__btn${active ? ' rte__btn--active' : ''}${item.cls ? ' ' + item.cls : ''}`}
                title={item.title}
                onMouseDown={saveSelection}
                onClick={(e) => handleToolbarClick(item, e)}
                disabled={disabled}
              >
                {item.cmd === 'insertImage' && uploading ? '⏳' : item.label}
              </button>
            );
          })}
        </div>

        {/* Панель выбранного медиа */}
        {mediaSelected && (
          <div className="rte__media-bar">
            <span className="rte__media-bar-label">Размер:</span>
            {[['200px','S'],['400px','M'],['600px','L'],['100%','Full']].map(([w, l]) => (
              <button key={w} type="button" className="rte__btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { resizeMedia(w); setMediaWidthInput(w !== '100%' ? w.replace('px', '') : ''); }}>
                {l}
              </button>
            ))}
            <span className="rte__sep" />
            <input
              type="number"
              className="rte__media-width-input"
              value={mediaWidthInput}
              min="50"
              max="2000"
              placeholder="400"
              onChange={e => setMediaWidthInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const px = parseInt(mediaWidthInput);
                  if (px > 0) resizeMedia(px + 'px');
                }
              }}
              onBlur={() => {
                const px = parseInt(mediaWidthInput);
                if (px > 0) resizeMedia(px + 'px');
              }}
            />
            <span className="rte__media-bar-label">px</span>
            <span className="rte__sep" />
            <span className="rte__media-bar-label">Выравнивание:</span>
            {[
              ['left',   '⬅', 'По левому краю'],
              ['center', '⬛', 'По центру'],
              ['right',  '➡', 'По правому краю'],
            ].map(([dir, lbl, title]) => (
              <button key={dir} type="button" className="rte__btn"
                title={title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAlign(dir)}>
                {lbl}
              </button>
            ))}
            <span className="rte__sep" />
            <span className="rte__media-bar-label">Курсор:</span>
            <button type="button" className="rte__btn"
              title="Поставить курсор выше (или перейти в существующий абзац)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertParagraphAround('before')}>
              ↑¶
            </button>
            <button type="button" className="rte__btn"
              title="Поставить курсор ниже (или перейти в существующий абзац)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertParagraphAround('after')}>
              ¶↓
            </button>
            <span className="rte__sep" />
            <button type="button" className="rte__btn rte__btn--danger" onMouseDown={(e) => e.preventDefault()} onClick={deleteMedia}>
              Удалить
            </button>
          </div>
        )}

      </div>{/* /rte__sticky-header */}

      {/* Редактор */}
      <div
        ref={editorRef}
        className="rte__editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseDown={handleEditorMouseDown}
        onClick={handleEditorClick}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onFocus={() => { isFocusedRef.current = true; updateActiveFormats(); }}
        onBlur={() => { isFocusedRef.current = false; }}
      />

      {/* Скрытые file inputs */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={sliderFileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleSliderFileSelect}
      />
      <input
        ref={imageRowFileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleImageRowFileSelect}
      />

      {/* ── Модал конструктора опроса ─────────────────────────────────── */}
      {showPollBuilder && createPortal(
        <div className="rte__modal-overlay">
          <div className="rte__modal-poll-inner">
            <PollBuilder
              onConfirm={handlePollConfirm}
              onCancel={() => setShowPollBuilder(false)}
            />
          </div>
        </div>,
        document.body
      )}

      {/* ── Слайдер-модал ─────────────────────────────────────────────── */}
      {showSliderModal && createPortal(
        <SliderModal
          title="🎠 Слайдер"
          editTitle="✏️ Редактировать слайдер"
          files={sliderFiles}
          uploading={sliderUploading}
          isEditing={!!editingSliderMarkerRef.current}
          onDelete={async () => {
            if (!(await showConfirm('Удалить слайдер?'))) return;
            editingSliderMarkerRef.current?.remove();
            handleInput();
            closeSliderModal();
          }}
          onFileSelect={handleSliderFileSelect}
          onRemove={(i) => {
            setSliderFiles(prev => {
              const next = [...prev];
              if (!next[i].isExisting && next[i].previewUrl) URL.revokeObjectURL(next[i].previewUrl);
              next.splice(i, 1);
              return next;
            });
          }}
          onAddMore={() => sliderFileRef.current?.click()}
          onInsert={handleSliderInsert}
          onClose={closeSliderModal}
          hasUploader={!!onUploadImage}
        />,
        document.body
      )}

      {/* ── Ряд изображений-модал ────────────────────────────────────── */}
      {showImageRowModal && createPortal(
        <SliderModal
          title="🖼️ Ряд изображений"
          editTitle="✏️ Редактировать ряд"
          files={imageRowFiles}
          uploading={imageRowUploading}
          isEditing={!!editingImageRowMarkerRef.current}
          onDelete={async () => {
            if (!(await showConfirm('Удалить ряд изображений?'))) return;
            editingImageRowMarkerRef.current?.remove();
            handleInput();
            closeImageRowModal();
          }}
          onFileSelect={handleImageRowFileSelect}
          onRemove={(i) => {
            setImageRowFiles(prev => {
              const next = [...prev];
              if (!next[i].isExisting && next[i].previewUrl) URL.revokeObjectURL(next[i].previewUrl);
              next.splice(i, 1);
              return next;
            });
          }}
          onAddMore={() => imageRowFileRef.current?.click()}
          onInsert={handleImageRowInsert}
          onClose={closeImageRowModal}
          hasUploader={!!onUploadImage}
        />,
        document.body
      )}

      {/* ── Модал списка игроков ───────────────────────────────────────── */}
      {showPlayerModal && createPortal(
        <PlayerModal
          players={filteredPlayers}
          search={playerSearch}
          selected={selectedPlayerNames}
          isEditing={!!editingPlayerMarkerRef.current}
          onDelete={async () => {
            if (!(await showConfirm('Удалить список игроков?'))) return;
            editingPlayerMarkerRef.current?.remove();
            handleInput();
            closePlayerModal();
          }}
          onSearch={setPlayerSearch}
          onToggle={togglePlayer}
          onInsert={handlePlayerListInsert}
          onClose={closePlayerModal}
        />,
        document.body
      )}
    </div>
  );
}

// ── Вспомогательные компоненты модалей (не экспортируются) ────────────────────

function SliderModal({ title, editTitle, files, uploading, isEditing, onDelete, onRemove, onAddMore, onInsert, onClose, hasUploader }) {
  const displayTitle = isEditing ? (editTitle || '✏️ Редактировать') : (title || '🎠 Слайдер');
  return (
    <div className="rte__modal-overlay">
      <div className="rte__modal-box">
        {/* Шапка */}
        <div className="rte__modal-header">
          <h3 className="rte__modal-title">{displayTitle}</h3>
          <button className="rte__modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Превью файлов */}
        {files.length > 0 && (
          <div className="rte__modal-grid">
            {files.map((item, i) => {
              const displayName = item.isExisting
                ? item.existingUrl.split('/').pop()
                : item.file.name;
              return (
                <div key={i} className="rte__modal-thumb">
                  {item.previewUrl ? (
                    item.isVideo ? (
                      <video src={item.previewUrl} className="rte__modal-thumb-preview" />
                    ) : (
                      <img src={item.previewUrl} alt="" className="rte__modal-thumb-preview" />
                    )
                  ) : (
                    <div className="rte__modal-thumb-placeholder">📄</div>
                  )}
                  <span className="rte__modal-thumb-name">{displayName}</span>
                  <button className="rte__modal-thumb-remove" onClick={() => onRemove(i)}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Кнопка добавления */}
        <button
          type="button"
          className="rte__modal-add-btn"
          onClick={onAddMore}
          disabled={!hasUploader}
        >
          {files.length ? '+ Добавить ещё файлы' : '+ Выбрать файлы (изображения, видео)'}
        </button>

        {/* Кнопки действий */}
        <div className="rte__modal-actions">
          {isEditing && onDelete ? (
            <button type="button" className="rte__modal-delete" onClick={onDelete}>Удалить</button>
          ) : <span />}
          <div className="rte__modal-actions-right">
            <button type="button" className="rte__modal-cancel" onClick={onClose}>Отмена</button>
            <button
              type="button"
              className="rte__modal-confirm"
              onClick={onInsert}
              disabled={!files.length || uploading}
            >
              {uploading ? 'Загрузка...' : isEditing ? `Сохранить (${files.length})` : `Вставить (${files.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerModal({ players, search, selected, isEditing, onDelete, onSearch, onToggle, onInsert, onClose }) {
  return (
    <div className="rte__modal-overlay">
      <div className="rte__modal-box rte__modal-box--narrow">
        {/* Шапка */}
        <div className="rte__modal-header">
          <h3 className="rte__modal-title">
            {isEditing ? '✏️ Редактировать список игроков' : '👥 Список игроков'}
          </h3>
          <button className="rte__modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Поиск */}
        <input
          type="text"
          className="rte__modal-search"
          placeholder="Поиск игрока..."
          value={search}
          onChange={e => onSearch(e.target.value)}
        />

        {/* Список */}
        <div className="rte__modal-list">
          {players.length === 0 && (
            <p className="rte__modal-empty">Игроки не найдены</p>
          )}
          {players.map((p, i) => {
            const isSelected = selected.includes(p.name);
            const avatarUrl = p.uuid
              ? `https://crafatar.icehost.xyz/avatars/${p.uuid}?overlay`
              : `https://api.dicebear.com/9.x/initials/svg?scale=80&backgroundColor[]&fontWeight=600&seed=${p.name}`;
            return (
              <label
                key={i}
                className={`rte__modal-player${isSelected ? ' rte__modal-player--selected' : ''}`}
              >
                <input
                  type="checkbox"
                  className="rte__modal-player-checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(p.name)}
                />
                <img
                  src={avatarUrl}
                  alt={p.name}
                  className="rte__modal-player-avatar"
                  onError={e => {
                    e.target.src = `https://api.dicebear.com/9.x/initials/svg?scale=80&backgroundColor[]&fontWeight=600&seed=${p.name}`;
                  }}
                />
                <span className="rte__modal-player-name">{p.name}</span>
              </label>
            );
          })}
        </div>

        {/* Выбрано */}
        {selected.length > 0 && (
          <p className="rte__modal-selected-count">Выбрано: {selected.length}</p>
        )}

        {/* Кнопки */}
        <div className="rte__modal-actions">
          {isEditing && onDelete ? (
            <button type="button" className="rte__modal-delete" onClick={onDelete}>Удалить</button>
          ) : <span />}
          <div className="rte__modal-actions-right">
            <button type="button" className="rte__modal-cancel" onClick={onClose}>Отмена</button>
            <button
              type="button"
              className="rte__modal-confirm"
              onClick={onInsert}
              disabled={!selected.length}
            >
              {isEditing ? `Сохранить (${selected.length})` : `Вставить (${selected.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// Определяет тип URL и возвращает нужный HTML
function buildVideoHtml(url) {
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (ytMatch) {
    return `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen title="YouTube video" style="width:100%;aspect-ratio:16/9;border-radius:10px;display:block;margin:12px 0;border:none;"></iframe>`;
  }
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return `<video src="${url}" controls style="width:400px;height:auto;display:block;margin:12px 0;"></video>`;
  }
  return `<iframe src="${url}" allowfullscreen title="Видео" style="width:100%;aspect-ratio:16/9;border-radius:10px;display:block;margin:12px 0;border:none;"></iframe>`;
}

export default RichTextEditor;
