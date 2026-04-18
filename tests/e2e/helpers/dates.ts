function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function today(): string {
  return toDateInputValue(new Date());
}

export function futureDate(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return toDateInputValue(date);
}

export function uniqueFutureDate(seed = 0): string {
  const salt = Math.floor(Date.now() / 60_000) % 120;
  return futureDate(30 + salt + seed);
}

export function uniqueFutureWeekdayDate(seed = 0): string {
  const salt = Math.floor(Date.now() / 60_000) % 120;
  const date = new Date();
  date.setDate(date.getDate() + 30 + salt + seed);
  while (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }
  return toDateInputValue(date);
}

export function nextSunday(): string {
  const date = new Date();
  const day = date.getDay();
  const delta = day === 0 ? 7 : 7 - day;
  date.setDate(date.getDate() + delta);
  return toDateInputValue(date);
}
