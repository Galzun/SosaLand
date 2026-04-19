const CRAFATAR = 'https://crafatar.icehost.xyz/avatars';
const DICEBEAR  = 'https://api.dicebear.com/9.x/initials/svg?scale=80&backgroundColor[]&fontWeight=600';

export function getAvatarUrl(username, uuid, useFallback = false) {
  if (!useFallback && uuid && !String(uuid).startsWith('offline:')) {
    return `${CRAFATAR}/${uuid}?overlay`;
  }
  return `${DICEBEAR}&seed=${encodeURIComponent(username || '?')}`;
}
