// Components/RichTextEditor/RichTextEditor.jsx
// Лёгкий WYSIWYG-редактор на базе contentEditable + execCommand.
// Тулбар: Bold / Italic / H2 / H3 / H4 / Blockquote / UL / OL / Вставить изображение / Вставить видео.
//
// Props:
//   value         — HTML-строка (контролируемый режим)
//   onChange(html)— колбэк при изменении содержимого
//   onUploadImage — async fn, получает File → возвращает { url: string }
//   placeholder   — подсказка при пустом содержимом

import { useRef, useEffect, useCallback, useState } from 'react';
import './RichTextEditor.scss';

// Иконки тулбара (текстовые символы — без внешних зависимостей)
const TOOLBAR = [
  { cmd: 'bold',          label: 'B',   title: 'Жирный (Ctrl+B)',   style: { fontWeight: 700 } },
  { cmd: 'italic',        label: 'I',   title: 'Курсив (Ctrl+I)',   style: { fontStyle: 'italic' } },
  { type: 'sep' },
  { cmd: 'formatBlock',   arg: 'h2',    label: 'H2', title: 'Заголовок 2' },
  { cmd: 'formatBlock',   arg: 'h3',    label: 'H3', title: 'Заголовок 3' },
  { cmd: 'formatBlock',   arg: 'h4',    label: 'H4', title: 'Заголовок 4' },
  { cmd: 'formatBlock',   arg: 'p',     label: '¶',  title: 'Обычный текст' },
  { type: 'sep' },
  { cmd: 'formatBlock',   arg: 'blockquote', label: '❝', title: 'Цитата' },
  { cmd: 'insertUnorderedList',  label: '•—', title: 'Маркированный список' },
  { cmd: 'insertOrderedList',    label: '1.', title: 'Нумерованный список' },
  { type: 'sep' },
  { cmd: 'insertImage', label: '🖼', title: 'Вставить изображение' },
  { cmd: 'insertVideo', label: '▶', title: 'Вставить видео (URL YouTube или ссылку)' },
];

function RichTextEditor({ value, onChange, onUploadImage, placeholder = 'Начните писать...' }) {
  const editorRef   = useRef(null);
  const fileRef     = useRef(null);
  const [uploading, setUploading] = useState(false);

  // Инициализация — устанавливаем начальное HTML-значение один раз
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Не перезаписываем, если пользователь уже что-то печатает
    if (el.innerHTML !== (value || '')) {
      el.innerHTML = value || '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  // При изменении value снаружи (загрузка для редактирования)
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      const el = editorRef.current;
      if (el && el.innerHTML !== value) {
        el.innerHTML = value || '';
      }
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML || '';
    onChange?.(html);
  }, [onChange]);

  // Сохраняем selection перед кликом по кнопке тулбара (mousedown срабатывает до blur)
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

  // Обработка нажатия кнопки тулбара
  const handleToolbarClick = useCallback(async (item, e) => {
    e.preventDefault();

    if (item.cmd === 'insertImage') {
      fileRef.current?.click();
      return;
    }

    if (item.cmd === 'insertVideo') {
      const url = prompt('Ссылка на видео (YouTube, mp4 и т.п.):');
      if (!url) return;
      restoreSelection();
      editorRef.current?.focus();

      const html = buildVideoHtml(url);
      document.execCommand('insertHTML', false, html);
      handleInput();
      return;
    }

    exec(item.cmd, item.arg);
  }, [exec, restoreSelection, handleInput]);

  // Загрузка изображения через onUploadImage
  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadImage) return;

    setUploading(true);
    try {
      const { url } = await onUploadImage(file);
      restoreSelection();
      editorRef.current?.focus();
      document.execCommand('insertHTML', false, `<img src="${url}" alt="" />`);
      handleInput();
    } catch (err) {
      alert('Ошибка загрузки изображения: ' + (err.message || 'неизвестная ошибка'));
    } finally {
      setUploading(false);
    }
  }, [onUploadImage, restoreSelection, handleInput]);

  // Enter в заголовках → вставляет <p> вместо продолжения heading
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      const sel   = window.getSelection();
      if (!sel.rangeCount) return;
      const block = sel.anchorNode?.parentElement?.closest('h2,h3,h4,blockquote');
      if (block) {
        e.preventDefault();
        document.execCommand('insertParagraph', false);
        document.execCommand('formatBlock', false, 'p');
        handleInput();
      }
    }
  }, [handleInput]);

  return (
    <div className="rte">
      {/* Тулбар */}
      <div className="rte__toolbar">
        {TOOLBAR.map((item, i) => {
          if (item.type === 'sep') {
            return <span key={i} className="rte__sep" />;
          }
          return (
            <button
              key={i}
              type="button"
              className="rte__btn"
              title={item.title}
              style={item.style}
              onMouseDown={saveSelection}
              onClick={(e) => handleToolbarClick(item, e)}
              disabled={uploading && item.cmd === 'insertImage'}
            >
              {item.cmd === 'insertImage' && uploading ? '⏳' : item.label}
            </button>
          );
        })}
      </div>

      {/* Редактор */}
      <div
        ref={editorRef}
        className="rte__editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
      />

      {/* Скрытый file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}

// Определяет тип URL и возвращает нужный HTML
function buildVideoHtml(url) {
  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (ytMatch) {
    const id = ytMatch[1];
    return `<iframe src="https://www.youtube.com/embed/${id}" allowfullscreen title="YouTube video"></iframe>`;
  }

  // Прямая ссылка на mp4/webm
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return `<video src="${url}" controls></video>`;
  }

  // Иначе — iframe
  return `<iframe src="${url}" allowfullscreen title="Видео"></iframe>`;
}

export default RichTextEditor;
