// 임원 관련 엑셀 시트 정의 (화면별 다운로드와 통합 내보내기에서 함께 사용)
import { POSITION_CATEGORY, label } from "@/lib/codes";
import { fmtDate, fmtTerm } from "@/lib/date";
import { APPT_STATUS_LABEL } from "@/lib/domain/appointment";
import type { SheetSpec } from "@/lib/excel";
import { getHistory, rosterRows, type HistoryFilter, type RosterEntry } from "@/lib/queries/officers";
import { prisma } from "@/lib/db";

type RosterRowX = ReturnType<typeof rosterRows>[number];

/** 임원 현황 (기준일) */
export function rosterSheet(roster: RosterEntry[], on: string): SheetSpec<RosterRowX & { quota: number }> {
  const quotaByName = new Map(roster.map((r) => [r.position.name, r.position.quota]));
  return {
    name: "임원현황",
    title: `임원 현황(${fmtDate(on)} 기준)`,
    notes: ["노란색: 임기 만료 3개월 이내 또는 직무수행(임기만료 후 후임자 임명 시까지) / 붉은색: 결원 / 임기 종료가 빈 칸: 해당 직책 재임기간(당연직)"],
    columns: [
      { header: "구분", key: "category", value: (r) => label(POSITION_CATEGORY, r.category) },
      { header: "직책", key: "positionName" },
      { header: "정원", key: "quota", type: "int" },
      { header: "성명", key: "name", value: (r) => r.appt?.person.name ?? "결원" },
      { header: "임기 시작", key: "start", type: "date", value: (r) => r.appt?.startDate },
      { header: "임기 종료", key: "end", type: "date", value: (r) => r.appt?.endDate },
      {
        header: "상태",
        key: "status",
        value: (r) =>
          !r.appt ? "결원" : r.appt.expiringSoon ? "재임중(3개월 내 만료)" : APPT_STATUS_LABEL[r.appt.status],
      },
      { header: "연임", key: "re", value: (r) => (r.appt?.isReappointment ? "연임" : "") },
      { header: "비고", key: "note", value: (r) => r.appt?.note },
    ],
    rows: rosterRows(roster).map((r) => ({ ...r, quota: quotaByName.get(r.positionName) ?? 0 })),
    landscape: true,
    highlight: (r) => (!r.appt ? "danger" : r.appt.expiringSoon || r.appt.status === "EXPIRED_SERVING" ? "warning" : null),
  };
}

/** 임원명단 출력용 (직책/성명/임기/학력/주요경력) */
export function rosterPrintSheet(roster: RosterEntry[], on: string, includeVacancies: boolean): SheetSpec<RosterRowX> {
  return {
    name: "임원명단",
    title: `임원 현황(${fmtDate(on)} 기준)`,
    columns: [
      { header: "직책", key: "positionName", width: 16 },
      { header: "성명", key: "name", width: 10, value: (r) => r.appt?.person.name ?? "결원" },
      { header: "임기", key: "term", width: 20, type: "multiline", value: (r) => (r.appt ? termText(r.appt) : "") },
      { header: "학력", key: "edu", width: 34, type: "multiline", value: (r) => r.appt?.person.education },
      { header: "주요경력", key: "career", width: 40, type: "multiline", value: (r) => r.appt?.person.career },
    ],
    rows: rosterRows(roster, includeVacancies),
  };
}

/**
 * 임원명단 임기 표기 ('24.03.02~'27.03.01)
 * - 임기만료 후 직무수행 중이면 둘째 줄에 (직무수행)
 * - 당연직이사처럼 종료일이 없으면 '24.03.02~ 둘째 줄에 (당연직)
 */
export function termText(a: { startDate: string; endDate: string | null; status: string }): string {
  if (!a.endDate) return `${fmtTerm(a.startDate, null)}\n(당연직)`;
  return fmtTerm(a.startDate, a.endDate) + (a.status === "EXPIRED_SERVING" ? "\n(직무수행)" : "");
}

/** 역대 임원 리스트 */
export async function historySheet(filter: HistoryFilter, on: string) {
  const rows = await getHistory(filter, on);
  const conds: string[] = [];
  if (filter.positionId) {
    const p = await prisma.position.findUnique({ where: { id: filter.positionId } });
    conds.push(`직책: ${p?.name ?? "-"}`);
  }
  if (filter.q) conds.push(`성명: ${filter.q}`);
  if (filter.from || filter.to) conds.push(`재임기간: ${fmtDate(filter.from) || "처음"} ~ ${fmtDate(filter.to) || "현재"}`);
  if (filter.status) conds.push(`상태: ${filter.status === "serving" ? "재임중" : "퇴임"}`);
  const sheet: SheetSpec<(typeof rows)[number]> = {
    name: "역대임원",
    title: "역대 임원 리스트",
    notes: [`조회 조건: ${conds.join(" / ") || "전체"}`],
    columns: [
      { header: "구분", key: "category", value: (a) => label(POSITION_CATEGORY, a.position.category) },
      { header: "직책", key: "position", value: (a) => a.position.name },
      { header: "성명", key: "name", value: (a) => a.person.name },
      { header: "임기 시작", key: "startDate", type: "date" },
      { header: "임기 종료(예정)", key: "endDate", type: "date" },
      { header: "실제 퇴임일", key: "retiredDate", type: "date" },
      { header: "연임", key: "re", value: (a) => (a.isReappointment ? "연임" : "") },
      { header: "상태", key: "status", value: (a) => APPT_STATUS_LABEL[a.status] },
      { header: "학력", key: "edu", type: "multiline", value: (a) => a.person.education },
      { header: "주요경력", key: "career", type: "multiline", value: (a) => a.person.career },
      { header: "비고", key: "note", value: (a) => [a.note, a.person.note].filter(Boolean).join(" / ") },
    ],
    rows,
    landscape: true,
  };
  return { sheet, conditionLabel: conds.length ? "조건" : "전체" };
}
