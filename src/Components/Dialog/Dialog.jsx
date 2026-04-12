import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { _register } from './dialogManager';
import './Dialog.scss';

/**
 * Монтируется в App.jsx один раз.
 * Регистрирует себя в dialogManager и рендерит текущий диалог.
 */
export function DialogRenderer() {
  const [dialog, setDialog] = useState(null);
  const [value,  setValue]  = useState('');
  const inputRef = useRef(null);

  // Регистрируем сеттер в синглтоне
  useEffect(() => {
    _register(setDialog);
    return () => _register(null);
  }, []);

  // Когда появляется prompt-диалог — инициализируем value и фокусируем поле
  useEffect(() => {
    if (!dialog) return;
    if (dialog.type === 'prompt') {
      setValue(dialog.defaultValue ?? '');
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [dialog]);

  const handleConfirm = useCallback(() => {
    if (!dialog) return;
    const result = dialog.type === 'prompt' ? value.trim() : true;
    dialog.resolve(result);
    setDialog(null);
  }, [dialog, value]);

  const handleCancel = useCallback(() => {
    if (!dialog) return;
    dialog.resolve(dialog.type === 'prompt' ? null : false);
    setDialog(null);
  }, [dialog]);

  // Глобальный keydown — Escape закрывает, Enter подтверждает (только для confirm)
  useEffect(() => {
    if (!dialog) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
      // Для confirm — Enter подтверждает
      if (e.key === 'Enter' && dialog.type === 'confirm') {
        e.preventDefault();
        handleConfirm();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dialog, handleConfirm, handleCancel]);

  if (!dialog) return null;

  const isConfirm = dialog.type === 'confirm';
  const isAlert   = dialog.type === 'alert';

  return createPortal(
    <div
      className="sosa-dialog-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && isConfirm) handleCancel(); }}
    >
      <div className="sosa-dialog-box" role="dialog" aria-modal="true">
        <p className="sosa-dialog-message">{dialog.message}</p>

        {dialog.type === 'prompt' && (
          <textarea
            ref={inputRef}
            className="sosa-dialog-textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={dialog.placeholder}
            rows={4}
          />
        )}

        <div className="sosa-dialog-actions">
          {!isAlert && (
            <button
              className="sosa-dialog-btn sosa-dialog-btn--cancel"
              onClick={handleCancel}
            >
              {dialog.cancelText}
            </button>
          )}
          <button
            className={`sosa-dialog-btn sosa-dialog-btn--confirm${isConfirm ? ' sosa-dialog-btn--danger' : ''}`}
            onClick={handleConfirm}
          >
            {dialog.confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
