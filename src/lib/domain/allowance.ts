import { daysBetweenInclusive, daysInMonth, monthEnd, monthStart } from "@/lib/date";

export type Rate = {
  id: number;
  effectiveFrom: string;
  monthlyFixed: number;
  faceFee: number;
  writtenFee: number;
  annualLimit: number;
  warningMargin: number;
};

/** 기준일에 적용되는 수당 기준 (적용 시작일이 기준일 이전인 것 중 가장 최근) */
export function rateOn<T extends Rate>(rates: T[], on: string): T | null {
  let found: T | null = null;
  for (const r of rates) {
    if (r.effectiveFrom <= on && (!found || r.effectiveFrom > found.effectiveFrom)) found = r;
  }
  return found;
}

/** 회의 방식별 회의수당 단가 (기타는 null → 담당자가 선택) */
export function meetingFee(rate: Rate, method: string): number | null {
  if (method === "FACE") return rate.faceFee;
  if (method === "WRITTEN") return rate.writtenFee;
  return null;
}

/**
 * 정액급여 산정
 * @param ranges 해당 월에 걸친 재임 기간들 (start~end, end=null 이면 계속 재임)
 * @param proRata 일할계산 여부 (원 미만 절사)
 */
export function fixedAllowance(
  rate: Rate,
  year: number,
  month: number,
  ranges: { start: string; end: string | null }[],
  proRata: boolean,
): { amount: number; days: number; totalDays: number } | null {
  const mStart = monthStart(year, month);
  const mEnd = monthEnd(year, month);
  const totalDays = daysInMonth(year, month);
  let days = 0;
  for (const r of ranges) {
    const s = r.start > mStart ? r.start : mStart;
    const e = r.end && r.end < mEnd ? r.end : mEnd;
    if (s <= e) days += daysBetweenInclusive(s, e);
  }
  days = Math.min(days, totalDays);
  if (days === 0) return null;
  const amount = proRata ? Math.floor((rate.monthlyFixed * days) / totalDays) : rate.monthlyFixed;
  return { amount, days, totalDays };
}
