// 이사회 회차·안건 엑셀 시트 정의 (화면별 다운로드와 통합 내보내기에서 함께 사용)
import { AGENDA_RESULT, AGENDA_TYPE, CONVOCATION, MEETING_METHOD, MEETING_STATUS, label } from "@/lib/codes";
import type { SheetSpec } from "@/lib/excel";
import { prisma } from "@/lib/db";
import { searchAgendas, splitKeywords, type AgendaFilter } from "@/lib/queries/agendas";
import { listMeetings, placeText, type MeetingFilter } from "@/lib/queries/meetings";

function methodText(m: { method: string; methodOther: string | null }) {
  return label(MEETING_METHOD, m.method) + (m.method === "OTHER" && m.methodOther ? `(${m.methodOther})` : "");
}

/** 이사회 개최 현황 */
export async function meetingsSheet(f: MeetingFilter) {
  const rows = await listMeetings(f);
  const conds = [`기간: ${f.period.label}`];
  if (f.method) conds.push(`개최 방법: ${label(MEETING_METHOD, f.method)}`);
  if (f.status) conds.push(`진행 상태: ${label(MEETING_STATUS, f.status)}`);
  const sheet: SheetSpec<(typeof rows)[number]> = {
    name: "개최현황",
    title: "이사회 개최 현황",
    notes: [`조회 조건: ${conds.join(" / ")}`, "출석률은 완료 회차만 계산하며, 재적이사가 아닌 감사는 제외합니다."],
    columns: [
      { header: "연도", key: "year", type: "year" },
      { header: "회차", key: "sessionNo", type: "year", value: (m) => m.sessionNo },
      { header: "개최일", key: "date", type: "date" },
      { header: "개최 방법", key: "method", value: methodText },
      { header: "대면", key: "face", type: "int", value: (m) => (m.method === "FACE" ? 1 : 0), total: "sum" },
      { header: "서면", key: "written", type: "int", value: (m) => (m.method === "WRITTEN" ? 1 : 0), total: "sum" },
      { header: "기타", key: "other", type: "int", value: (m) => (m.method === "OTHER" ? 1 : 0), total: "sum" },
      { header: "개최 지역", key: "region", value: (m) => m.region?.name },
      { header: "상세 위치", key: "locationDetail" },
      { header: "진주 본사", key: "hq", type: "int", value: (m) => (m.isHeadOffice ? 1 : 0), total: "sum" },
      { header: "소집 근거", key: "convocation", value: (m) => label(CONVOCATION, m.convocation) },
      { header: "진행 상태", key: "status", value: (m) => label(MEETING_STATUS, m.status) },
      { header: "심의 안건", key: "deliberations", type: "int", total: "sum" },
      { header: "보고 안건", key: "reports", type: "int", total: "sum" },
      {
        header: "재적인원",
        key: "memberCount",
        type: "int",
        value: (m) => (m.status === "DONE" ? m.memberCount : null),
        total: "sum",
      },
      {
        header: "출석인원",
        key: "presentCount",
        type: "int",
        value: (m) => (m.status === "DONE" ? m.presentCount : null),
        total: "sum",
      },
      {
        header: "출석률",
        key: "rate",
        type: "percent",
        value: (m) => m.attendanceRate,
        total: (c) => `IFERROR(${c.cell("presentCount")}/${c.cell("memberCount")},0)`,
      },
      { header: "비고", key: "note" },
    ],
    rows,
    landscape: true,
  };
  return sheet;
}

/** 안건 목록·검색 결과 */
export async function agendasSheet(f: AgendaFilter) {
  const rows = await searchAgendas(f);
  const conds: string[] = [];
  if (f.meetingId) {
    const m = await prisma.meeting.findUnique({ where: { id: f.meetingId } });
    conds.push(`회차: ${m ? `${m.year}년 제${m.sessionNo}회` : "-"}`);
  } else conds.push(`기간: ${f.period.label}`);
  if (f.q) conds.push(`검색어: ${f.q}`);
  if (f.type) conds.push(`구분: ${label(AGENDA_TYPE, f.type)}`);
  if (f.result) conds.push(`결과: ${f.result === "NONE" ? "미입력" : label(AGENDA_RESULT, f.result)}`);
  if (f.departmentId) {
    const d = await prisma.department.findUnique({ where: { id: f.departmentId } });
    conds.push(`담당부서: ${d?.name ?? "-"}`);
  }
  if (f.method) conds.push(`개최 방법: ${label(MEETING_METHOD, f.method)}`);
  if (f.recusal === "1") conds.push("의결제외 있는 안건");
  const sheet: SheetSpec<(typeof rows)[number]> = {
    name: "안건",
    title: "이사회 안건 목록",
    notes: [`조회 조건: ${conds.join(" / ")}`],
    columns: [
      { header: "연도", key: "year", type: "year", value: (a) => a.meeting.year },
      { header: "회차", key: "session", type: "year", value: (a) => a.meeting.sessionNo },
      { header: "개최일", key: "date", type: "date", value: (a) => a.meeting.date },
      { header: "개최 방법", key: "method", value: (a) => methodText(a.meeting) },
      { header: "구분", key: "type", value: (a) => label(AGENDA_TYPE, a.type) },
      { header: "번호", key: "agendaNo", value: (a) => `제${a.agendaNo}호` },
      { header: "안건명", key: "title", total: "count" },
      { header: "담당부서", key: "dept", value: (a) => a.department?.name },
      { header: "발표자", key: "presenter" },
      { header: "담당자", key: "contact" },
      { header: "결과", key: "result", value: (a) => label(AGENDA_RESULT, a.result) },
      { header: "수정 내용", key: "amendment", type: "multiline" },
      { header: "의결제외 인원", key: "recusals", type: "int", value: (a) => a._count.recusals || null },
      { header: "설명", key: "description", type: "multiline" },
      { header: "키워드", key: "keywords", value: (a) => splitKeywords(a.keywords).join(", ") },
      ...(f.q
        ? [{ header: "일치 위치", key: "matched", value: (a: (typeof rows)[number]) => a.matched.join(", ") }]
        : []),
      { header: "장소", key: "place", value: (a) => placeText(a.meeting) },
    ],
    rows,
    landscape: true,
  };
  return sheet;
}
