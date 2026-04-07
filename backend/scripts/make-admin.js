const db = require('../db');

const username = 'lxtdown'; // 👈 напиши свой ник

db.run(
  `UPDATE users SET role = 'admin' WHERE username = ?`,
  [username],
  function(err) {
    if (err) {
      console.error('Ошибка:', err);
    } else if (this.changes === 0) {
      console.log(`Пользователь "${username}" не найден`);
    } else {
      console.log(`✅ Пользователь "${username}" теперь админ!`);
    }
  }
);