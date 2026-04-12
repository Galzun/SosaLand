// dialogManager.js
// Синглтон для показа кастомных диалогов вместо window.alert/confirm/prompt.
// Использование:
//   import { showConfirm, showPrompt } from '../Dialog/dialogManager';
//   const ok = await showConfirm('Удалить пост?');
//   const text = await showPrompt('Причина бана:', { placeholder: 'Необязательно...' });

let _setState = null;

/** Регистрируется DialogRenderer при монтировании. */
export function _register(setter) {
  _setState = setter;
}

/**
 * Показывает диалог подтверждения.
 * @param {string} message
 * @param {{ confirmText?: string, cancelText?: string }} [options]
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    _setState?.({
      type: 'confirm',
      message,
      confirmText: options.confirmText ?? 'Удалить',
      cancelText:  options.cancelText  ?? 'Отмена',
      resolve,
    });
  });
}

/**
 * Показывает информационный диалог с одной кнопкой «ОК».
 * @param {string} message
 * @param {{ confirmText?: string }} [options]
 * @returns {Promise<void>}
 */
export function showAlert(message, options = {}) {
  return new Promise((resolve) => {
    _setState?.({
      type: 'alert',
      message,
      confirmText: options.confirmText ?? 'ОК',
      cancelText:  '',
      resolve,
    });
  });
}

/**
 * Показывает диалог с вводом текста (textarea).
 * @param {string} message
 * @param {{ placeholder?: string, defaultValue?: string, confirmText?: string, cancelText?: string }} [options]
 * @returns {Promise<string|null>} null если отменено
 */
export function showPrompt(message, options = {}) {
  return new Promise((resolve) => {
    _setState?.({
      type: 'prompt',
      message,
      placeholder:  options.placeholder  ?? '',
      defaultValue: options.defaultValue  ?? '',
      confirmText:  options.confirmText   ?? 'Подтвердить',
      cancelText:   options.cancelText    ?? 'Отмена',
      resolve,
    });
  });
}
