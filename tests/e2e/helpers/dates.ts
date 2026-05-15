const E2E_TIMEZONE_ID = process.env.E2E_TIMEZONE_ID || 'America/New_York';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function currentE2eCalendarDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: E2E_TIMEZONE_ID,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const partValue = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${partValue('year')}-${partValue('month')}-${partValue('day')}`;
}

function addDays(dateValue: string, days: number): string {
  const [year, month, day] = dateValue.split('-').map(value => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function weekdayIndex(dateValue: string): number {
  const [year, month, day] = dateValue.split('-').map(value => Number(value));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function today(): string {
  return currentE2eCalendarDate();
}

export function futureDate(daysAhead: number): string {
  return addDays(today(), daysAhead);
}

export function uniqueFutureDate(seed = 0): string {
  const salt = Math.floor(Date.now() / 60_000) % 120;
  return futureDate(30 + salt + seed);
}

export function uniqueFutureWeekdayDate(seed = 0): string {
  const salt = Math.floor(Date.now() / 60_000) % 120;
  let dateValue = futureDate(30 + salt + seed);
  while (weekdayIndex(dateValue) === 0) {
    dateValue = addDays(dateValue, 1);
  }
  return dateValue;
}

export function nextSunday(): string {
  const dateValue = today();
  const day = weekdayIndex(dateValue);
  const delta = day === 0 ? 7 : 7 - day;
  return addDays(dateValue, delta);
}

export function displayDate(dateValue: string): string {
  const [year, month, day] = dateValue.split('-').map(value => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${WEEKDAYS[date.getUTCDay()]}, ${String(day).padStart(2, '0')}-${MONTHS[month - 1]}-${year}`;
}
