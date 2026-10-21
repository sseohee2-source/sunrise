// 연도 또는 기간(시작일~종료일) 조회 조건 — 목록 화면과 엑셀 다운로드가 같은 규칙을 씀
import { isDate, sp, type SearchParams } from "@/lib/action-result";
import { fmtDate, today } from "@/lib/date";

export type Period = {
  /** 조회 시작일·종료일 (없으면 제한 없음) */
  from?: string;
  to?: string;
  /** 연도 선택 값 ("all" = 전체) */
  year: number | "all" | null;
  /** 화면·엑셀 표시용 (예: "2026년", "2026.01.01~2026.06.30", "전체") */
  label: string;
  /** 파일명용 (예: "2026", "20260101-20260630", "전체") */
  fileLabel: string;
};

/**
 * ?year=2026 / ?year=all / ?from=2026-01-01&to=2026-06-30
 * 시작일·종료일이 있으면 연도보다 우선. 아무것도 없으면 올해.
 */
export function parsePeriod(params: SearchParams): Period {
  const from = sp(params, "from");
  const to = sp(params, "to");
  if ((from && isDate(from)) || (to && isDate(to))) {
    const f = isDate(from) ? from : undefined;
    const t = isDate(to) ? to : undefined;
    return {
      from: f,
      to: t,
      year: null,
      label: `${fmtDate(f) || "처음"} ~ ${fmtDate(t) || "현재"}`,
      fileLabel: `${f?.replaceAll("-", "") ?? ""}-${t?.replaceAll("-", "") ?? ""}`,
    };
  }
  const y = sp(params, "year");
  if (y === "all") return { year: "all", label: "전체 기간", fileLabel: "전체" };
  const year = y && /^\d{4}$/.test(y) ? Number(y) : Number(today().slice(0, 4));
  return { year, from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}년`, fileLabel: String(year) };
}

/** Prisma where 조건 (날짜 문자열 필드용) */
export function dateWhere(p: Period): { gte?: string; lte?: string } | undefined {
  if (!p.from && !p.to) return undefined;
  return { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: p.to } : {}) };
}
