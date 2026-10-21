import { addMonths, fmtDate } from "@/lib/date";

/** 종료일이 없는 임기(당연직이사: 해당 직책 재임기간) 표시 문구 */
export const OPEN_TERM_LABEL = "해당 직책 재임기간";

type ApptDates = { startDate: string; endDate: string | null; retiredDate: string | null };

/**
 * 재임 상태
 * - SERVING: 임기 중
 * - EXPIRED_SERVING: 임기 종료일이 지났으나 실제 퇴임일이 비어 있음
 *   → '직무수행' (정관 제7조③ 임기가 만료한 임원은 후임자가 임명될 때까지 직무를 수행)
 * - RETIRED: 실제 퇴임일 이후
 * - FUTURE: 임기 시작 전
 */
export type ApptStatus = "SERVING" | "EXPIRED_SERVING" | "RETIRED" | "FUTURE";

export const APPT_STATUS_LABEL: Record<ApptStatus, string> = {
  SERVING: "재임중",
  EXPIRED_SERVING: "직무수행",
  RETIRED: "퇴임",
  FUTURE: "취임 예정",
};

export function apptStatus(a: ApptDates, on: string): ApptStatus {
  if (on < a.startDate) return "FUTURE";
  if (a.retiredDate && on > a.retiredDate) return "RETIRED";
  if (!a.retiredDate && a.endDate && on > a.endDate) return "EXPIRED_SERVING";
  return "SERVING";
}

/** 기준일에 재임 중인지 (실제 퇴임일 당일까지 재임으로 봄, 퇴임일이 없으면 임기 종료 후에도 재임) */
export function isServingOn(a: ApptDates, on: string): boolean {
  const s = apptStatus(a, on);
  return s === "SERVING" || s === "EXPIRED_SERVING";
}

/** 실제 재임 마지막 날 (퇴임일이 없으면 null = 계속 재임) */
export function servingUntil(a: ApptDates): string | null {
  return a.retiredDate ?? null;
}

/** 기준일로부터 3개월 이내 임기 만료 예정 */
export function isExpiringSoon(a: ApptDates, on: string): boolean {
  return apptStatus(a, on) === "SERVING" && !!a.endDate && a.endDate <= addMonths(on, 3);
}

/** 두 재임 기간이 겹치는지 */
export function overlaps(a: ApptDates, b: ApptDates): boolean {
  const aEnd = a.retiredDate ?? "9999-12-31";
  const bEnd = b.retiredDate ?? "9999-12-31";
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/** 화면 표기: 2024.03.02 ~ 2026.03.01 (종료일이 없으면 '해당 직책 재임기간') */
export function termRange(a: { startDate: string; endDate: string | null }): string {
  return `${fmtDate(a.startDate)} ~ ${a.endDate ? fmtDate(a.endDate) : `(${OPEN_TERM_LABEL})`}`;
}
