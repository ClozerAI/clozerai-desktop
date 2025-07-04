export function millisecondsToTimeString(
  milliseconds: number,
  showSeconds = true,
  showMinutes = true,
  showHours = true,
) {
  if (milliseconds <= 1000) {
    return 'now';
  }

  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  let result = [];

  if (days > 0) {
    result.push(`${days} day${days > 1 ? 's' : ''}`);
    if (showHours) {
      result.push(`${remainingHours} hour${remainingHours > 1 ? 's' : ''}`);
    }
  } else if (hours > 0) {
    result.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (showMinutes) {
      result.push(`${remainingMinutes} min${remainingMinutes > 1 ? 's' : ''}`);
    }
  } else if (minutes > 0) {
    result.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
    if (showSeconds) {
      result.push(`${remainingSeconds} sec${remainingSeconds > 1 ? 's' : ''}`);
    }
  } else if (seconds > 0) {
    result.push(`${seconds} sec${seconds > 1 ? 's' : ''}`);
  }

  return result.join(' ');
}
