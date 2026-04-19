const CRAFATAR = 'https://crafatar.icehost.xyz/avatars';
const DICEBEAR  = 'https://api.dicebear.com/9.x/initials/svg?scale=80&backgroundColor[]&fontWeight=600';

function avatarUrl(minecraftUuid, username, size = 64) {
  if (minecraftUuid && !String(minecraftUuid).startsWith('offline:')) {
    return `${CRAFATAR}/${minecraftUuid}?size=${size}&overlay`;
  }
  return `${DICEBEAR}&seed=${encodeURIComponent(username || '?')}`;
}

module.exports = avatarUrl;
