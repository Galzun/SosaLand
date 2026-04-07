// Components/FileIcon/FileIcon.jsx
// Отображает иконку файла в зависимости от MIME-типа.
// Используется в сообщениях для файловых вложений.

function FileIcon({ fileType, size = 32 }) {
  // Определяем иконку и цвет по MIME-типу
  const getIconData = (mime) => {
    if (!mime) return { icon: '📎', color: '#aaa' };

    const t = mime.toLowerCase();

    if (t.startsWith('image/'))           return { icon: '🖼️',  color: '#4aff9e' };
    if (t.startsWith('video/'))           return { icon: '🎬',  color: '#ff9e4a' };
    if (t.startsWith('audio/'))           return { icon: '🎵',  color: '#9e4aff' };
    if (t === 'application/pdf')          return { icon: '📄',  color: '#ff4a4a' };
    if (t.includes('word') || t.includes('document'))
                                          return { icon: '📝',  color: '#4a9eff' };
    if (t.includes('excel') || t.includes('spreadsheet') || t.includes('csv'))
                                          return { icon: '📊',  color: '#4aff7a' };
    if (t.includes('powerpoint') || t.includes('presentation'))
                                          return { icon: '📋',  color: '#ff7a4a' };
    if (t === 'application/zip' || t.includes('archive') || t.includes('compressed') || t.includes('tar'))
                                          return { icon: '🗜️', color: '#ffcc4a' };
    if (t.startsWith('text/'))            return { icon: '📃',  color: '#aaa' };

    return { icon: '📎', color: '#aaa' };
  };

  const { icon, color } = getIconData(fileType);

  return (
    <span
      style={{
        fontSize:   `${size}px`,
        lineHeight: 1,
        color,
        flexShrink: 0,
      }}
      role="img"
      aria-label="файл"
    >
      {icon}
    </span>
  );
}

export default FileIcon;
