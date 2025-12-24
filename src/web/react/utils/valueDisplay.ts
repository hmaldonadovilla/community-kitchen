import type { LangCode, OptionSet } from '../../types';
import { tSystem } from '../../systemStrings';

export const EMPTY_DISPLAY = '—';

const normalizeLang = (language: LangCode): 'EN' | 'FR' | 'NL' => {
  const key = (language || 'EN').toString().trim().toUpperCase();
  return (key === 'FR' || key === 'NL' || key === 'EN' ? key : 'EN') as 'EN' | 'FR' | 'NL';
};

const pad2 = (n: number) => n.toString().padStart(2, '0');

const WEEKDAYS: Record<'EN' | 'FR' | 'NL', string[]> = {
  EN: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  FR: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  NL: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
};

const MONTHS: Record<'EN' | 'FR' | 'NL', string[]> = {
  EN: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  FR: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  NL: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
};

export const formatDateEeeDdMmmYyyy = (raw: any, language: LangCode): string => {
  if (raw === undefined || raw === null || raw === '') return EMPTY_DISPLAY;
  const lang = normalizeLang(language);

  const format = (d: Date) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return EMPTY_DISPLAY;
    const weekday = WEEKDAYS[lang][d.getDay()] || WEEKDAYS.EN[d.getDay()];
    const month = MONTHS[lang][d.getMonth()] || MONTHS.EN[d.getMonth()];
    return `${weekday}, ${pad2(d.getDate())}-${month}-${d.getFullYear()}`;
  };

  if (raw instanceof Date) return format(raw);
  const s = raw?.toString?.().trim?.() || '';
  if (!s) return EMPTY_DISPLAY;

  // Canonical DATE storage: "YYYY-MM-DD" (treat as local date to avoid timezone shifts).
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    return format(new Date(y, m - 1, d));
  }

  // Common display/storage fallback: "DD/MM/YYYY"
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    return format(new Date(y, m - 1, d));
  }

  // ISO-like strings (e.g., "2025-12-20T23:00:00.0Z")
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return format(new Date(t));

  return s;
};

export const localizeOptionValue = (value: string, optionSet: OptionSet | undefined, language: LangCode): string => {
  const raw = (value ?? '').toString();
  if (!raw) return raw;
  if (!optionSet) return raw;

  const base = optionSet.en;
  if (!Array.isArray(base) || !base.length) return raw;

  const lang = normalizeLang(language);
  const labels = (lang === 'FR' ? optionSet.fr : lang === 'NL' ? optionSet.nl : optionSet.en) || optionSet.en;
  if (!Array.isArray(labels) || !labels.length) return raw;

  const idx = base.findIndex(v => (v ?? '').toString() === raw);
  if (idx < 0) return raw;

  const mapped = labels[idx];
  const out = mapped !== undefined && mapped !== null ? mapped.toString().trim() : '';
  return out || raw;
};

export const formatDisplayText = (value: any, opts: { language: LangCode; optionSet?: OptionSet; fieldType?: string }): string => {
  const { language, optionSet, fieldType } = opts;

  if (fieldType === 'DATE') {
    return formatDateEeeDdMmmYyyy(value, language);
  }

  if (value === undefined || value === null || value === '') return EMPTY_DISPLAY;

  if (typeof value === 'boolean') {
    return value ? tSystem('values.yes', language, 'Yes') : tSystem('values.no', language, 'No');
  }

  if (Array.isArray(value)) {
    if (!value.length) return EMPTY_DISPLAY;
    const localized = value
      .map(v => {
        if (typeof v === 'boolean') return v ? tSystem('values.yes', language, 'Yes') : tSystem('values.no', language, 'No');
        if (typeof v === 'string') return localizeOptionValue(v, optionSet, language);
        if (v === undefined || v === null) return '';
        return `${v}`;
      })
      .map(v => (v ?? '').toString().trim())
      .filter(Boolean);
    return localized.length ? localized.join(', ') : EMPTY_DISPLAY;
  }

  if (typeof value === 'object') {
    // Best-effort for upload payloads or object-like values.
    const url = (value as any)?.url;
    if (typeof url === 'string') {
      const trimmed = url.trim();
      return trimmed || EMPTY_DISPLAY;
    }
    return `${value}`;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return EMPTY_DISPLAY;
    return localizeOptionValue(trimmed, optionSet, language);
  }

  return `${value}`;
};


