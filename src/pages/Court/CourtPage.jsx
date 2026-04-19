// pages/Court/CourtPage.jsx
// Страница «Суд» — жалобы игроков, чат тикетов, судебные заседания.
// Три вкладки:
//   1. Суды      — список судебных заседаний (создать — manage_court или admin+)
//   2. Подать    — форма создания жалобы (любой авторизованный, + прикрепить файлы)
//   3. Тикеты    — все тикеты с чатом (manage_court или admin+); для обычных — «Мои жалобы»

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CourtCaseCard from './CourtCaseCard';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import { showConfirm, showPrompt, showAlert } from '../../Components/Dialog/dialogManager';
import { getAvatarUrl } from '../../utils/avatarUrl';
import { renderWithMentions } from '../../Components/CommentSection/CommentSection';
import { getMentionAtCursor } from '../../utils/mentionUtils';
import MentionDropdown from '../../Components/MentionDropdown/MentionDropdown';
import MessageInput from '../../Components/MessageInput/MessageInput';
import FileIcon from '../../Components/FileIcon/FileIcon';
import ImageModal from '../../Components/ImageModal/ImageModal';
// Импортируем стили ChatWindow чтобы использовать .chat__msg* классы
import '../../Components/ChatWindow/ChatWindow.scss';
import '../../Components/MessageInput/MessageInput.scss';
import './CourtPage.scss';

const ROLE_LEVEL = { user: 1, editor: 2, admin: 3, creator: 4 };

function timeAgo(tsSeconds) {
  if (!tsSeconds) return '';
  const diff = Math.floor(Date.now() / 1000) - tsSeconds;
  if (diff < 60)    return 'только что';
  if (diff < 3600)  return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return new Date(tsSeconds * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatDatetime(tsSeconds) {
  if (!tsSeconds) return '—';
  return new Date(tsSeconds * 1000).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(tsSeconds) {
  if (!tsSeconds) return '';
  return new Date(tsSeconds * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

const STATUS_LABEL = {
  pending:   { text: 'Ожидает',         cls: 'court-status--pending' },
  reviewing: { text: 'Рассматривается', cls: 'court-status--reviewing' },
  closed:    { text: 'Закрыт',          cls: 'court-status--closed' },
  rejected:  { text: 'Отклонён',        cls: 'court-status--rejected' },
};

function StatusBadge({ status }) {
  const s = STATUS_LABEL[status] || { text: status, cls: '' };
  return <span className={`court-status ${s.cls}`}>{s.text}</span>;
}

// ---------------------------------------------------------------------------
// Файловые вложения — использует те же классы что ChatWindow
// ---------------------------------------------------------------------------
function isMediaAtt(att) {
  return att.fileType?.startsWith('image/') || att.fileType?.startsWith('video/');
}

function getMessageFiles(msg) {
  const files = [];
  if (msg.fileUrl) files.push({ fileUrl: msg.fileUrl, fileType: msg.fileType || '', fileName: msg.fileName || '' });
  if (msg.files?.length) files.push(...msg.files);
  return files;
}

function AttachmentList({ attachments, onOpenLightbox }) {
  if (!attachments?.length) return null;

  const mediaFiles = attachments.filter(isMediaAtt);
  const otherFiles = attachments.filter(a => !isMediaAtt(a));

  return (
    <div className="court-attachments">
      {mediaFiles.length === 1 ? (
        mediaFiles[0].fileType?.startsWith('image/')
          ? <img className="chat__msg-image" src={mediaFiles[0].fileUrl} alt={mediaFiles[0].fileName || ''} onClick={() => onOpenLightbox?.(mediaFiles, 0)} loading="lazy" style={{ cursor: 'pointer', maxWidth: '100%', borderRadius: 8 }} />
          : <video className="chat__msg-video" src={mediaFiles[0].fileUrl} controls playsInline style={{ colorScheme: 'dark', maxWidth: '100%' }} />
      ) : mediaFiles.length > 1 ? (
        <div className={`chat__media-grid chat__media-grid--${Math.min(mediaFiles.length, 4)}`}>
          {mediaFiles.slice(0, 4).map((att, i) => {
            const isLast  = i === Math.min(mediaFiles.length, 4) - 1;
            const extra   = mediaFiles.length - 4;
            const isVideo = att.fileType?.startsWith('video/');
            return (
              <div key={i} className="chat__media-grid-item" onClick={() => onOpenLightbox?.(mediaFiles, i)}>
                {isVideo ? <video src={`${att.fileUrl}#t=0.1`} preload="metadata" muted /> : <img src={att.fileUrl} alt={att.fileName || ''} loading="lazy" />}
                {isVideo && !(isLast && extra > 0) && <span className="chat__media-grid-play">▶</span>}
                {isLast && extra > 0 && <div className="chat__media-grid-overlay">+{extra}</div>}
              </div>
            );
          })}
        </div>
      ) : null}
      {otherFiles.map((att, i) => {
        if (att.fileType?.startsWith('audio/')) {
          return (
            <audio key={i} className="chat__msg-audio" src={att.fileUrl} controls style={{ colorScheme: 'dark' }} />
          );
        }
        return (
          <a key={i} className="chat__msg-file" href={att.fileUrl} download={att.fileName} target="_blank" rel="noopener noreferrer">
            <FileIcon fileType={att.fileType} size={28} />
            <span className="chat__msg-file-name">{att.fileName || 'Файл'}</span>
            <span className="chat__msg-file-download">⬇</span>
          </a>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Чат тикета — MessageInput + рендеринг в стиле ChatWindow
// ---------------------------------------------------------------------------
function TicketChat({ ticket, token, canManage }) {
  const { user } = useAuth();
  const [messages,  setMessages]  = useState(ticket.messages || []);
  const [lightbox,  setLightbox]  = useState(null);
  const bottomRef   = useRef(null);
  const areaRef     = useRef(null);

  useEffect(() => {
    setMessages(ticket.messages || []);
  }, [ticket.id]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const wasAtBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
    if (wasAtBottom || messages.length <= 1) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Для модераторов — только когда тикет принят; для создателя — всегда кроме closed/rejected
  const isCreator = user?.id === ticket.creator?.id;
  const canWrite = canManage && !isCreator
    ? ticket.status === 'reviewing'
    : ticket.status !== 'closed' && ticket.status !== 'rejected';

  // onSend — вызывается MessageInput с (text, uploadedFiles)
  const handleSend = useCallback(async (text, files = []) => {
    const hasContent = text?.trim();
    const hasFiles   = files.length > 0;
    if (!hasContent && !hasFiles) return;

    const firstFile = files[0] || null;
    const extraFiles = files.slice(1);

    try {
      const { data } = await axios.post(
        `/api/court/tickets/${ticket.id}/messages`,
        {
          content:   text?.trim() || '',
          fileUrl:   firstFile?.fileUrl   || null,
          fileType:  firstFile?.fileType  || null,
          fileName:  firstFile?.fileName  || null,
          filesJson: extraFiles.length > 0 ? JSON.stringify(extraFiles) : null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages(prev => [...prev, data]);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Ошибка отправки');
    }
  }, [ticket.id, token]);

  const openLightbox = (items, index) => {
    setLightbox({
      items: items.map((a, i) => ({ id: a.fileUrl || `m${i}`, fileUrl: a.fileUrl, fileType: a.fileType, fileName: a.fileName })),
      index,
    });
  };

  const renderMsg = (msg, prev) => {
    // Системное сообщение — как разделитель
    if (msg.isSystem) {
      return (
        <div key={msg.id} className="chat__date-divider court-chat__sys">
          <span>{msg.content}</span>
        </div>
      );
    }

    const isOwn = msg.senderId === user?.id || msg.sender?.id === user?.id;
    const allFiles   = getMessageFiles(msg);
    const mediaFiles = allFiles.filter(isMediaAtt);
    const otherFiles = allFiles.filter(a => !isMediaAtt(a));
    const mediaOnly  = mediaFiles.length >= 2 && otherFiles.length === 0 && !msg.content;

    return (
      <div key={msg.id} className={`chat__msg-wrapper${isOwn ? ' chat__msg-wrapper--own' : ''}`}>
        <div className={`chat__msg${isOwn ? ' chat__msg--own' : ' chat__msg--other'}`}>
          {!isOwn && (
            <div className="chat__msg-avatar">
              <img
                src={msg.sender?.avatarUrl || getAvatarUrl(msg.sender?.username, null)}
                alt={msg.sender?.username || '?'}
                onError={e => { e.target.onerror = null; e.target.src = getAvatarUrl(msg.sender?.username, null); }}
              />
            </div>
          )}
          <div className="chat__msg-body">
            <div className={`chat__msg-bubble${mediaOnly ? ' chat__msg-bubble--media-only' : ''}`}>
              {/* Медиа-сетка */}
              {mediaFiles.length >= 2 ? (
                <div className={`chat__media-grid chat__media-grid--${Math.min(mediaFiles.length, 4)}`}>
                  {mediaFiles.slice(0, 4).map((att, i) => {
                    const isLast  = i === Math.min(mediaFiles.length, 4) - 1;
                    const extra   = mediaFiles.length - 4;
                    const isVideo = att.fileType?.startsWith('video/');
                    return (
                      <div key={i} className="chat__media-grid-item" onClick={() => openLightbox(mediaFiles, i)}>
                        {isVideo ? <video src={`${att.fileUrl}#t=0.1`} preload="metadata" muted /> : <img src={att.fileUrl} alt="" loading="lazy" />}
                        {isVideo && !(isLast && extra > 0) && <span className="chat__media-grid-play">▶</span>}
                        {isLast && extra > 0 && <div className="chat__media-grid-overlay">+{extra}</div>}
                      </div>
                    );
                  })}
                </div>
              ) : mediaFiles.length === 1 ? (
                mediaFiles[0].fileType?.startsWith('image/')
                  ? <img className="chat__msg-image" src={mediaFiles[0].fileUrl} alt="" onClick={() => openLightbox(mediaFiles, 0)} loading="lazy" />
                  : <video className="chat__msg-video" src={mediaFiles[0].fileUrl} controls playsInline style={{ colorScheme: 'dark' }} />
              ) : null}
              {/* Аудио / документы */}
              {otherFiles.map((att, i) =>
                att.fileType?.startsWith('audio/') ? (
                  <audio key={i} className="chat__msg-audio" src={att.fileUrl} controls style={{ colorScheme: 'dark' }} />
                ) : (
                  <a key={i} className="chat__msg-file" href={att.fileUrl} download={att.fileName} target="_blank" rel="noopener noreferrer">
                    <FileIcon fileType={att.fileType} size={28} />
                    <span className="chat__msg-file-name">{att.fileName || 'Файл'}</span>
                    <span className="chat__msg-file-download">⬇</span>
                  </a>
                )
              )}
              {msg.content && (
                <p className="chat__msg-text">{renderWithMentions(msg.content)}</p>
              )}
            </div>
            <div className="chat__msg-meta">
              <span className="chat__msg-time">{formatTime(msg.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="court-chat-wrap">
      <div className="court-chat-wrap__messages" ref={areaRef}>
        {messages.length === 0 && (
          <div className="court-chat-wrap__empty">Нет сообщений. Напишите первым!</div>
        )}
        {messages.map((msg, i) => renderMsg(msg, messages[i - 1]))}
        <div ref={bottomRef} />
      </div>

      {canWrite ? (
        <div className="court-chat-wrap__input">
          <MessageInput onSend={handleSend} disabled={false} />
        </div>
      ) : ticket.status === 'pending' && canManage ? (
        <div className="court-chat-wrap__closed court-chat-wrap__closed--pending">
          ⏳ Примите тикет в работу, чтобы начать общение
        </div>
      ) : (
        <div className="court-chat-wrap__closed">Тикет закрыт — сообщения не принимаются</div>
      )}

      {lightbox && (
        <ImageModal
          images={lightbox.items}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          showSidebar={false}
          showShare={false}
          albumRanges={[{ startIndex: 0, items: lightbox.items }]}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Вкладка «Подать жалобу» — с прикреплением файлов как доказательств
// ---------------------------------------------------------------------------
function CreateTicketTab({ token, onCreated }) {
  const { allPlayers } = usePlayer();
  const [accusedName,  setAccusedName]  = useState('');
  const [title,        setTitle]        = useState('');
  const [description,  setDescription]  = useState('');
  const [pendingFiles, setPendingFiles] = useState([]); // { file, previewUrl }
  const [uploading,    setUploading]    = useState(false);
  const [uploadPct,    setUploadPct]    = useState(0);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState(null);
  const [success,      setSuccess]      = useState(false);
  const fileInputRef    = useRef(null);
  const accusedInputRef = useRef(null);
  const descTextareaRef = useRef(null);

  // ── Mention для поля «Ник обвиняемого» ──
  const [accusedMention, setAccusedMention] = useState(null); // { query, startIndex }
  const [accusedMIdx,    setAccusedMIdx]    = useState(0);
  const accusedDropRef = useRef(null);

  const accusedSuggestions = accusedMention
    ? allPlayers.filter(p => p.name.toLowerCase().startsWith(accusedMention.query)).slice(0, 7)
    : [];

  const handleAccusedChange = (e) => {
    const val = e.target.value;
    setAccusedName(val);
    setAccusedMention(getMentionAtCursor(val, e.target.selectionStart));
    setAccusedMIdx(0);
  };

  const insertAccusedMention = (username) => {
    // Для поля имени — вставляем только ник без @
    const before = accusedName.slice(0, accusedMention.startIndex);
    const after  = accusedName.slice(accusedMention.startIndex + 1 + accusedMention.query.length);
    const newVal = before + username + after;
    setAccusedName(newVal);
    setAccusedMention(null);
    setTimeout(() => {
      if (accusedInputRef.current) {
        const pos = before.length + username.length;
        accusedInputRef.current.selectionStart = pos;
        accusedInputRef.current.selectionEnd   = pos;
        accusedInputRef.current.focus();
      }
    }, 0);
  };

  const handleAccusedKeyDown = (e) => {
    if (!accusedMention || accusedSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAccusedMIdx(i => Math.min(i + 1, accusedSuggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAccusedMIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertAccusedMention(accusedSuggestions[accusedMIdx].name); }
    else if (e.key === 'Escape') setAccusedMention(null);
  };

  // Закрытие дропдауна accused по клику вне
  useEffect(() => {
    if (!accusedMention) return;
    const handler = (e) => {
      if (accusedDropRef.current && !accusedDropRef.current.contains(e.target) &&
          accusedInputRef.current && !accusedInputRef.current.contains(e.target))
        setAccusedMention(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [accusedMention]);

  // ── Mention для поля «Описание» ──
  const [descMention, setDescMention] = useState(null);
  const [descMIdx,    setDescMIdx]    = useState(0);
  const descDropRef = useRef(null);

  const descSuggestions = descMention
    ? allPlayers.filter(p => p.name.toLowerCase().startsWith(descMention.query)).slice(0, 7)
    : [];

  const handleDescChange = (e) => {
    const val = e.target.value;
    setDescription(val);
    setDescMention(getMentionAtCursor(val, e.target.selectionStart));
    setDescMIdx(0);
  };

  const insertDescMention = (username) => {
    const before  = description.slice(0, descMention.startIndex);
    const after   = description.slice(descMention.startIndex + 1 + descMention.query.length);
    const newText = before + '@' + username + ' ' + after;
    setDescription(newText);
    setDescMention(null);
    setTimeout(() => {
      if (descTextareaRef.current) {
        const pos = before.length + username.length + 2;
        descTextareaRef.current.selectionStart = pos;
        descTextareaRef.current.selectionEnd   = pos;
        descTextareaRef.current.focus();
      }
    }, 0);
  };

  const handleDescKeyDown = (e) => {
    if (!descMention || descSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setDescMIdx(i => Math.min(i + 1, descSuggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setDescMIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertDescMention(descSuggestions[descMIdx].name); }
    else if (e.key === 'Escape') setDescMention(null);
  };

  // Закрытие дропдауна desc по клику вне
  useEffect(() => {
    if (!descMention) return;
    const handler = (e) => {
      if (descDropRef.current && !descDropRef.current.contains(e.target) &&
          descTextareaRef.current && !descTextareaRef.current.contains(e.target))
        setDescMention(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [descMention]);

  // Освобождаем blob-URL при размонтировании
  useEffect(() => () => { pendingFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    const newItems = selected.map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') || file.type.startsWith('video/')
        ? URL.createObjectURL(file) : null,
    }));
    setPendingFiles(prev => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (i) => {
    setPendingFiles(prev => {
      if (prev[i]?.previewUrl) URL.revokeObjectURL(prev[i].previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    let uploadedFiles = [];

    // Загружаем файлы-доказательства
    if (pendingFiles.length > 0) {
      setUploading(true);
      setUploadPct(0);
      try {
        if (pendingFiles.length === 1) {
          const fd = new FormData();
          fd.append('file', pendingFiles[0].file);
          const { data } = await axios.post('/api/upload', fd, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            onUploadProgress: ev => { if (ev.total) setUploadPct(Math.round(ev.loaded / ev.total * 100)); },
          });
          uploadedFiles = [{ fileUrl: data.fileUrl, fileType: data.fileType, fileName: data.fileName }];
        } else {
          const fd = new FormData();
          pendingFiles.forEach(f => fd.append('files[]', f.file));
          const { data } = await axios.post('/api/upload', fd, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            onUploadProgress: ev => { if (ev.total) setUploadPct(Math.round(ev.loaded / ev.total * 100)); },
          });
          uploadedFiles = (data.files || []).map(f => ({ fileUrl: f.fileUrl, fileType: f.fileType, fileName: f.fileName }));
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Ошибка загрузки файлов');
        setUploading(false);
        setSaving(false);
        return;
      }
      setUploading(false);
    }

    try {
      const { data: ticket } = await axios.post('/api/court/tickets', {
        accusedName,
        title,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Описание + доказательства идут первым сообщением в чат
      const firstFile  = uploadedFiles[0] || null;
      const extraFiles = uploadedFiles.slice(1);
      await axios.post(`/api/court/tickets/${ticket.id}/messages`, {
        content:   description.trim() || '',
        fileUrl:   firstFile?.fileUrl  || null,
        fileType:  firstFile?.fileType || null,
        fileName:  firstFile?.fileName || null,
        filesJson: extraFiles.length > 0 ? JSON.stringify(extraFiles) : null,
      }, { headers: { Authorization: `Bearer ${token}` } });

      pendingFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      setSuccess(true);
      setAccusedName('');
      setTitle('');
      setDescription('');
      setPendingFiles([]);
      onCreated?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при отправке жалобы');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="court-create">
      <div className="court-create__info">
        <span>⚖️</span>
        <span>Подайте жалобу на игрока, нарушившего правила сервера. Прикрепите скриншоты или видео как доказательства.</span>
      </div>

      {success && (
        <div className="court-create__success">
          <div>✅ Жалоба отправлена! Администрация рассмотрит её в ближайшее время.</div>
          <button className="court-btn court-btn--ghost" onClick={() => setSuccess(false)}>Подать ещё одну</button>
        </div>
      )}

      {!success && (
        <form className="court-form" onSubmit={handleSubmit}>
          <label className="court-form__label">Ник обвиняемого игрока *</label>
          <div style={{ position: 'relative' }}>
            <input
              ref={accusedInputRef}
              className="court-form__input"
              value={accusedName}
              onChange={handleAccusedChange}
              onKeyDown={handleAccusedKeyDown}
              onClick={e => { setAccusedMention(getMentionAtCursor(e.target.value, e.target.selectionStart)); setAccusedMIdx(0); }}
              placeholder="PlayerName или @ник"
              required maxLength={50}
            />
            <MentionDropdown
              dropRef={accusedDropRef}
              players={accusedSuggestions}
              activeIndex={accusedMIdx}
              onSelect={insertAccusedMention}
              onHover={setAccusedMIdx}
            />
          </div>

          <label className="court-form__label">Тема жалобы *</label>
          <input
            className="court-form__input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Кратко опишите нарушение"
            required maxLength={200}
          />

          <label className="court-form__label">
            Подробное описание * <span className="court-form__hint">(макс. 3000 символов)</span>
          </label>
          <div className="court-form__desc-wrap" style={{ position: 'relative' }}>
            <textarea
              ref={descTextareaRef}
              className="court-form__textarea"
              value={description}
              onChange={handleDescChange}
              onKeyDown={handleDescKeyDown}
              onClick={e => { setDescMention(getMentionAtCursor(e.target.value, e.target.selectionStart)); setDescMIdx(0); }}
              placeholder="Опишите ситуацию: что произошло, когда, где, какие есть доказательства..."
              required rows={7} maxLength={3000}
            />
            <MentionDropdown
              dropRef={descDropRef}
              players={descSuggestions}
              activeIndex={descMIdx}
              onSelect={insertDescMention}
              onHover={setDescMIdx}
            />
          </div>
          <div className="court-form__counter">{description.length} / 3000</div>

          {/* Файлы-доказательства */}
          <label className="court-form__label">Доказательства <span className="court-form__hint">(скриншоты, видео, файлы — необязательно)</span></label>

          {pendingFiles.length > 0 && (
            <div className="msg-input__previews">
              {pendingFiles.map((item, i) => (
                <div key={i} className="msg-input__preview-item">
                  {item.previewUrl && item.file.type.startsWith('image/') ? (
                    <img className="msg-input__preview-thumb" src={item.previewUrl} alt={item.file.name} />
                  ) : item.previewUrl && item.file.type.startsWith('video/') ? (
                    <video className="msg-input__preview-thumb" src={item.previewUrl} muted />
                  ) : (
                    <div className="msg-input__preview-file">
                      <FileIcon fileType={item.file.type} size={22} />
                      <div className="msg-input__preview-meta">
                        <span className="msg-input__preview-name">{item.file.name}</span>
                        <span className="msg-input__preview-size">{formatBytes(item.file.size)}</span>
                      </div>
                    </div>
                  )}
                  <button className="msg-input__preview-remove" type="button" onClick={() => removeFile(i)} disabled={uploading}>✕</button>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div className="msg-input__uploading">
              <div className="msg-input__progress-bar">
                <div className="msg-input__progress-fill" style={{ width: `${uploadPct}%` }} />
              </div>
              <span>Загрузка {uploadPct}%...</span>
            </div>
          )}

          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
          <button
            type="button"
            className={`court-btn court-btn--ghost court-form__attach-btn${pendingFiles.length > 0 ? ' court-form__attach-btn--has' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            📎 Прикрепить файлы {pendingFiles.length > 0 && `(${pendingFiles.length})`}
          </button>

          {error && <div className="court-form__error">{error}</div>}

          <div className="court-form__actions">
            <button type="submit" className="court-btn court-btn--primary" disabled={saving || uploading}>
              {saving ? 'Отправка...' : 'Отправить жалобу'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Вкладка «Суды» — сетка заседаний (дизайн как EventsPage)
// ---------------------------------------------------------------------------
function CasesTab({ canManage, token }) {
  const navigate = useNavigate();
  const [cases,   setCases]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/court/cases', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setCases(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="court-cases-tab">
      <div className="court-cases-tab__header">
        <h2 className="court-cases-tab__title">Судебные заседания</h2>
        {canManage && (
          <button className="court-cases-tab__btn" onClick={() => navigate('/court/cases/create')}>
            + Создать заседание
          </button>
        )}
      </div>

      {loading ? (
        <div className="court-page__loading">Загрузка...</div>
      ) : cases.length === 0 ? (
        <div className="court-page__empty">Заседаний пока нет</div>
      ) : (
        <div className="court-cases-tab__grid">
          {cases.map(c => <CourtCaseCard key={c.id} courtCase={c} />)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Вкладка «Тикеты» / «Мои жалобы»
// ---------------------------------------------------------------------------
function TicketsTab({ canManage, token }) {
  const [tickets,    setTickets]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [filter,     setFilter]     = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'detail'
  const filterRef = useRef(null);

  const endpoint = canManage ? '/api/court/tickets' : '/api/court/tickets/my';

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = canManage && filter ? `?status=${filter}` : '';
      const r = await axios.get(`${endpoint}${params}`, { headers: { Authorization: `Bearer ${token}` } });
      setTickets(r.data);
    } catch {}
    setLoading(false);
  }, [endpoint, token, filter, canManage]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Закрываем дропдаун по клику вне
  useEffect(() => {
    if (!showFilter) return;
    const handler = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilter(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilter]);

  const loadTicket = async (id) => {
    try {
      const r = await axios.get(`/api/court/tickets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setSelected(r.data);
      setMobileView('detail');
    } catch {}
  };

  const handleReview = async (id) => {
    try {
      await axios.post(`/api/court/tickets/${id}/review`, {}, { headers: { Authorization: `Bearer ${token}` } });
      loadTickets(); loadTicket(id);
    } catch (err) { showAlert(err.response?.data?.error || 'Ошибка'); }
  };

  const handleReject = async (id) => {
    const reason = await showPrompt('Причина отклонения (необязательно):', { placeholder: 'Укажите причину...' });
    if (reason === null) return;
    try {
      await axios.post(`/api/court/tickets/${id}/reject`, { reason }, { headers: { Authorization: `Bearer ${token}` } });
      loadTickets(); loadTicket(id);
    } catch (err) { showAlert(err.response?.data?.error || 'Ошибка'); }
  };

  const handleClose = async (id) => {
    if (!await showConfirm('Закрыть тикет?', { confirmText: 'Закрыть' })) return;
    try {
      await axios.post(`/api/court/tickets/${id}/close`, {}, { headers: { Authorization: `Bearer ${token}` } });
      loadTickets(); loadTicket(id);
    } catch (err) { showAlert(err.response?.data?.error || 'Ошибка'); }
  };

  const handleDeleteTicket = async (e, id) => {
    e.stopPropagation();
    if (!await showConfirm('Удалить тикет? Это действие необратимо.')) return;
    try {
      await axios.delete(`/api/court/tickets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (selected?.id === id) setSelected(null);
      loadTickets();
    } catch (err) { showAlert(err.response?.data?.error || 'Ошибка'); }
  };

  const FILTER_OPTIONS = [
    { value: '',          label: 'Все' },
    { value: 'pending',   label: STATUS_LABEL.pending.text },
    { value: 'reviewing', label: STATUS_LABEL.reviewing.text },
    { value: 'closed',    label: STATUS_LABEL.closed.text },
    { value: 'rejected',  label: STATUS_LABEL.rejected.text },
  ];

  const activeLabel = FILTER_OPTIONS.find(o => o.value === filter)?.label ?? 'Все';

  return (
    <div className="court-tickets">
      <div className={`court-tickets__layout${mobileView === 'detail' ? ' court-tickets__layout--detail-view' : ''}`}>
        {/* Список */}
        <div className="court-tickets__list">
          {canManage && (
            <div className="court-tickets__filter-wrap" ref={filterRef}>
              <button
                className="court-tickets__filter-toggle"
                onClick={() => setShowFilter(p => !p)}
              >
                {activeLabel} ▾
              </button>
              {showFilter && (
                <div className="court-tickets__filter-dropdown">
                  {FILTER_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      className={`court-tickets__filter-option${filter === o.value ? ' court-tickets__filter-option--active' : ''}`}
                      onClick={() => { setFilter(o.value); setShowFilter(false); }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {loading && <div className="court-page__loading">Загрузка...</div>}
          {!loading && tickets.length === 0 && (
            <div className="court-page__empty">{canManage ? 'Тикетов нет' : 'Вы ещё не подавали жалоб'}</div>
          )}
          {tickets.map(t => (
            <div
              key={t.id}
              className={`court-ticket-card${selected?.id === t.id ? ' court-ticket-card--active' : ''}`}
              onClick={() => loadTicket(t.id)}
            >
              <div className="court-ticket-card__header">
                <StatusBadge status={t.status} />
                {canManage && (
                  <button className="court-ticket-card__del" onClick={e => handleDeleteTicket(e, t.id)}>🗑</button>
                )}
              </div>
              <span className="court-ticket-card__title">{t.title}</span>
              <div className="court-ticket-card__meta">
                ⚖️ <b>{t.accusedName}</b>
                {canManage && t.creator && <> · {t.creator.username}</>}
              </div>
              <div className="court-ticket-card__time">{timeAgo(t.createdAt)}</div>
            </div>
          ))}
        </div>

        {/* Детали + чат */}
        {selected ? (
          <div className="court-tickets__detail">
            <button className="court-tickets__back-btn" onClick={() => setMobileView('list')}>
              ← Назад к списку
            </button>
            <div className="court-tickets__detail-header">
              <div className="court-tickets__detail-titlerow">
                <span className="court-tickets__detail-title">{selected.title}</span>
                <StatusBadge status={selected.status} />
              </div>
              <div className="court-tickets__detail-meta">
                <span>⚖️ <b>{selected.accusedName}</b></span>
                {selected.reviewer && <span>Рецензент: <b>{selected.reviewer.username}</b></span>}
                <span>{formatDatetime(selected.createdAt)}</span>
              </div>
              {selected.rejectionReason && (
                <div className="court-tickets__rejection">
                  ❌ Причина отклонения: {selected.rejectionReason}
                </div>
              )}
              {canManage && (
                <div className="court-tickets__detail-actions">
                  {selected.status === 'pending' && (
                    <button className="court-btn court-btn--secondary" onClick={() => handleReview(selected.id)}>
                      ⚖️ Рассмотреть
                    </button>
                  )}
                  {(selected.status === 'pending' || selected.status === 'reviewing') && (
                    <button className="court-btn court-btn--danger" onClick={() => handleReject(selected.id)}>
                      ❌ Отклонить
                    </button>
                  )}
                  {selected.status === 'reviewing' && (
                    <button className="court-btn court-btn--ghost" onClick={() => handleClose(selected.id)}>
                      ✅ Закрыть
                    </button>
                  )}
                </div>
              )}
            </div>

            <TicketChat key={selected.id} ticket={selected} token={token} canManage={canManage} />
          </div>
        ) : (
          <div className="court-tickets__empty-detail">
            <span>Выберите тикет из списка</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CourtPage — корневой компонент
// ---------------------------------------------------------------------------
function CourtPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [activeTab,      setActiveTab]      = useState('cases');
  const [ticketRefresh,  setTicketRefresh]  = useState(0);

  if (authLoading) return null;

  const perms       = user?.customPermissions ?? [];
  const callerLevel = ROLE_LEVEL[user.role] ?? 0;
  const canManage   = callerLevel >= ROLE_LEVEL.admin || perms.includes('manage_court');

  const tabs = [
    { id: 'cases',   label: '⚖️ Суды' },
    { id: 'create',  label: '📋 Подать жалобу' },
    { id: 'tickets', label: canManage ? '🎫 Тикеты' : '🎫 Мои жалобы' },
  ];

  const renderContent = () => {
    if (activeTab === 'cases') return <CasesTab canManage={canManage} token={token} />;
    if (!user) return (
      <div className="court-page__auth-required">
        <p>Войдите, чтобы воспользоваться этой вкладкой.</p>
        <a href="/auth" className="court-page__auth-link">Войти</a>
      </div>
    );
    if (activeTab === 'create') return <CreateTicketTab token={token} onCreated={() => setTicketRefresh(n => n + 1)} />;
    if (activeTab === 'tickets') return <TicketsTab key={ticketRefresh} canManage={canManage} token={token} />;
  };

  return (
    <div className={`court-page${activeTab === 'tickets' ? ' court-page--tickets' : ''}`}>
      <div className="court-page__tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`court-page__tab${activeTab === t.id ? ' court-page__tab--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="court-page__content">
        {renderContent()}
      </div>
    </div>
  );
}

export default CourtPage;
