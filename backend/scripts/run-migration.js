// scripts/run-migration.js
// Запускает все миграции по порядку.
// Использование: node scripts/run-migration.js  (или npm run migrate)

const migration001 = require('../migrations/001_create_users');
const migration002 = require('../migrations/002_rename_password_to_hash');
const migration003 = require('../migrations/003_create_tickets');
const migration004 = require('../migrations/004_create_players');
const migration005 = require('../migrations/005_add_contact_to_tickets');
const migration006 = require('../migrations/006_add_profile_fields');
const migration007 = require('../migrations/007_add_image_positions');
const migration008 = require('../migrations/008_add_image_extras');
const migration009 = require('../migrations/009_add_image_edge');
const migration010 = require('../migrations/010_create_posts');
const migration011 = require('../migrations/011_create_likes');
const migration012 = require('../migrations/012_create_images');
const migration013 = require('../migrations/013_card_bg');
const migration014 = require('../migrations/014_create_comments');
const migration015 = require('../migrations/015_comment_images');
const migration016 = require('../migrations/016_ui_customization');
const migration017 = require('../migrations/017_create_messages');
const migration018 = require('../migrations/018_border_text_columns');
const migration019 = require('../migrations/019_post_attachments');
const migration020 = require('../migrations/020_add_video_fields');
const migration021 = require('../migrations/021_add_group_id');
const migration022 = require('../migrations/022_create_news');

async function runMigrations() {
  console.log('Запуск миграций...\n');

  try {
    // Запускаем миграции в нужном порядке.
    // Когда появятся новые миграции — добавляем их сюда следующей строкой.
    await migration001.up();
    console.log('✓ 001_create_users — таблица users создана');

    await migration002.up();
    console.log('✓ 002_rename_password_to_hash — колонка password переименована в password_hash');

    await migration003.up();
    console.log('✓ 003_create_tickets — таблица tickets создана');

    await migration004.up();
    console.log('✓ 004_create_players — таблица players создана');

    await migration005.up();
    console.log('✓ 005_add_contact_to_tickets — колонка contact добавлена в tickets');

    await migration006.up();
    console.log('✓ 006_add_profile_fields — поля cover_url, background_url, bio, updated_at добавлены в users');

    await migration007.up();
    console.log('✓ 007_add_image_positions — поля позиционирования cover и bg добавлены в users');

    await migration008.up();
    console.log('✓ 008_add_image_extras — поля поворота, заливки и размытия добавлены в users');

    await migration009.up();
    console.log('✓ 009_add_image_edge — поля плавности краёв cover_edge, bg_edge добавлены в users');

    await migration010.up();
    console.log('✓ 010_create_posts — таблица posts создана');

    await migration011.up();
    console.log('✓ 011_create_likes — таблица likes создана');

    await migration012.up();
    console.log('✓ 012_create_images — таблица images создана');

    await migration013.up();
    console.log('✓ 013_card_bg — поля card_bg_color, card_bg_alpha добавлены в users');

    await migration014.up();
    console.log('✓ 014_create_comments — таблица comments создана');

    await migration015.up();
    console.log('✓ 015_comment_images — колонка image_url добавлена в comments');

    await migration016.up();
    console.log('✓ 016_ui_customization — поля кастомизации UI-элементов добавлены в users');

    await migration017.up();
    console.log('✓ 017_create_messages — таблицы conversations и messages созданы');

    await migration018.up();
    console.log('✓ 018_border_text_columns — поля рамки, текста и акцента добавлены в users');

    await migration019.up();
    console.log('✓ 019_post_attachments — таблица post_attachments создана, image_url мигрированы');

    await migration020.up();
    console.log('✓ 020_add_video_fields — поля видео-метаданных добавлены в images');

    await migration021.up();
    console.log('✓ 021_add_group_id — колонка group_id добавлена в images');

    await migration022.up();
    console.log('✓ 022_create_news — таблица news создана, comments.news_id добавлена');

    console.log('\nВсе миграции выполнены успешно.');
  } catch (err) {
    console.error('\nОшибка при выполнении миграции:', err.message);
    process.exit(1);
  }

  // Завершаем процесс явно, потому что подключение к БД держит его открытым.
  process.exit(0);
}

runMigrations();
