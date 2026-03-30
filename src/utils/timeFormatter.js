export function timeAgo(timestamp) {
  const now = Date.now();
  const diffInSeconds = Math.floor((now - timestamp) / 1000);
  
  // Только что (меньше минуты)
  if (diffInSeconds < 60) {
    return 'только что';
  }
  
  // Минуты
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    const minutes = diffInMinutes;
    const word = getMinutesWord(minutes);
    return `${minutes} ${word} назад`;
  }
  
  // Часы
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    const hours = diffInHours;
    const word = getHoursWord(hours);
    return `${hours} ${word} назад`;
  }
  
  // Дни
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    const days = diffInDays;
    const word = getDaysWord(days);
    return `${days} ${word} назад`;
  }
  
  // Недели
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    const weeks = diffInWeeks;
    const word = getWeeksWord(weeks);
    return `${weeks} ${word} назад`;
  }
  
  // Месяцы
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    const months = diffInMonths;
    const word = getMonthsWord(months);
    return `${months} ${word} назад`;
  }
  
  // Годы
  const diffInYears = Math.floor(diffInDays / 365);
  const years = diffInYears;
  const word = getYearsWord(years);
  return `${years} ${word} назад`;
}

// Вспомогательные функции для склонения слов
function getMinutesWord(minutes) {
  if (minutes >= 11 && minutes <= 14) return 'минут';
  const lastDigit = minutes % 10;
  if (lastDigit === 1) return 'минуту';
  if (lastDigit >= 2 && lastDigit <= 4) return 'минуты';
  return 'минут';
}

function getHoursWord(hours) {
  if (hours >= 11 && hours <= 14) return 'часов';
  const lastDigit = hours % 10;
  if (lastDigit === 1) return 'час';
  if (lastDigit >= 2 && lastDigit <= 4) return 'часа';
  return 'часов';
}

function getDaysWord(days) {
  if (days >= 11 && days <= 14) return 'дней';
  const lastDigit = days % 10;
  if (lastDigit === 1) return 'день';
  if (lastDigit >= 2 && lastDigit <= 4) return 'дня';
  return 'дней';
}

function getWeeksWord(weeks) {
  if (weeks >= 11 && weeks <= 14) return 'недель';
  const lastDigit = weeks % 10;
  if (lastDigit === 1) return 'неделю';
  if (lastDigit >= 2 && lastDigit <= 4) return 'недели';
  return 'недель';
}

function getMonthsWord(months) {
  if (months >= 11 && months <= 14) return 'месяцев';
  const lastDigit = months % 10;
  if (lastDigit === 1) return 'месяц';
  if (lastDigit >= 2 && lastDigit <= 4) return 'месяца';
  return 'месяцев';
}

function getYearsWord(years) {
  if (years >= 11 && years <= 14) return 'лет';
  const lastDigit = years % 10;
  if (lastDigit === 1) return 'год';
  if (lastDigit >= 2 && lastDigit <= 4) return 'года';
  return 'лет';
}