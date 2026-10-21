// 날짜는 DB에 'YYYY-MM-DD' 문자열로 저장한다.

/** 오늘 날짜 (한국 시간 기준) 'YYYY-MM-DD' */
export function today(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 화면 표기: 2026-10-21 → 2026.10.21 */
export function fmtDate(d: string | null | undefined): string {
  return d ? d.replaceAll("-", ".") : "";
}

/** 임원명단 임기 표기: 2024-03-02 → '24.03.02 */
export function fmtShortDate(d: string | null | undefined): string {
  return d ? `'${d.slice(2).replaceAll("-", ".")}` : "";
}

/** 임기 표기: '24.03.02~'27.03.01 */
export function fmtTerm(start: string, end: string | null | undefined): string {
  return `${fmtShortDate(start)}~${fmtShortDate(end)}`;
}

/** 'YYYY-MM-DD' → 엑셀 저장용 Date (UTC 자정, 엑셀에서 날짜가 밀리지 않음) */
export function toExcelDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/** 파일명용 오늘 날짜 YYYYMMDD */
export function todayCompact(): string {
  return today().replaceAll("-", "");
}

export function addDays(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
}

export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, day)).toISOString().slice(0, 10);
}

/** 해당 월의 일수 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 두 날짜 사이 일수 (양 끝 포함) */
export function daysBetweenInclusive(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86400_000) + 1;
}

export function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthEnd(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

/** 금액 표기: 1234567 → 1,234,567 */
export function fmtMoney(n: number | null | undefined): string {
  return n == null ? "" : n.toLocaleString("ko-KR");
}

/** 비율 표기: 0.8567 → 85.7% */
export function fmtPercent(r: number | null | undefined, digits = 1): string {
  return r == null || Number.isNaN(r) ? "-" : `${(r * 100).toFixed(digits)}%`;
}
