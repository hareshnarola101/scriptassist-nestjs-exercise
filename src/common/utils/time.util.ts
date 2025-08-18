export const parseDurationToSeconds = (
    duration: string,
    defaultSeconds: number
  ): number => {
    if (!duration) return defaultSeconds;
  
    const unit = duration.slice(-1);
    const value = parseInt(duration.slice(0, -1), 10);
  
    if (isNaN(value)) return defaultSeconds;
  
    switch (unit) {
      case 's': return value; // seconds
      case 'm': return value * 60; // minutes
      case 'h': return value * 60 * 60; // hours
      case 'd': return value * 60 * 60 * 24; // days
      case 'w': return value * 60 * 60 * 24 * 7; // weeks
      default: return defaultSeconds;
    }
};