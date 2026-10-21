// 1단계 점검용: 공통 엑셀 모듈 시험 출력 (7단계에서 통합 내보내기로 대체)
import { ALLOWANCE_NOTICE, MEETING_METHOD, label } from "@/lib/codes";
import { prisma } from "@/lib/db";
import { buildWorkbook, excelResponse, makeFilename, type SheetSpec } from "@/lib/excel";

export async function GET() {
  const appts = await prisma.appointment.findMany({
    include: { person: true, position: true },
    orderBy: [{ position: { sortOrder: "asc" } }, { startDate: "asc" }],
  });
  const officers: SheetSpec<(typeof appts)[number]> = {
    name: "역대임원",
    title: "역대 임원 리스트",
    notes: ["조건: 전체"],
    columns: [
      { header: "직책", key: "position", value: (a) => a.position.name },
      { header: "성명", key: "name", value: (a) => a.person.name },
      { header: "임기 시작", key: "startDate", type: "date" },
      { header: "임기 종료", key: "endDate", type: "date" },
      { header: "실제 퇴임일", key: "retiredDate", type: "date" },
      { header: "연임", key: "re", value: (a) => (a.isReappointment ? "연임" : "") },
      { header: "학력", key: "edu", value: (a) => a.person.education, type: "multiline" },
      { header: "주요경력", key: "career", value: (a) => a.person.career, type: "multiline" },
    ],
    rows: appts,
    landscape: true,
  };

  const meetings = await prisma.meeting.findMany({
    where: { status: "DONE" },
    include: { attendances: true },
    orderBy: [{ date: "asc" }],
  });
  const attendRows = meetings.map((m) => {
    const members = m.attendances.filter((a) => a.isMember);
    const present = members.filter((a) => a.status === "PRESENT").length;
    return {
      year: m.year,
      sessionNo: `제${m.sessionNo}회`,
      date: m.date,
      method: label(MEETING_METHOD, m.method),
      members: members.length,
      present,
      rate: members.length ? present / members.length : 0,
    };
  });
  const attendance: SheetSpec<(typeof attendRows)[number]> = {
    name: "출석률_회차별",
    title: "회차별 출석 현황",
    columns: [
      { header: "연도", key: "year", type: "year" },
      { header: "회차", key: "sessionNo" },
      { header: "개최일", key: "date", type: "date" },
      { header: "개최 방법", key: "method" },
      { header: "재적인원", key: "members", type: "int", total: "sum" },
      { header: "출석인원", key: "present", type: "int", total: "sum" },
      {
        header: "출석률",
        key: "rate",
        type: "percent",
        total: (c) => `IFERROR(${c.cell("present")}/${c.cell("members")},0)`,
      },
    ],
    rows: attendRows,
  };

  const payments = await prisma.allowancePayment.groupBy({ by: ["personId", "year", "kind"], _sum: { amount: true } });
  const persons = new Map((await prisma.person.findMany()).map((p) => [p.id, p.name]));
  const byKey = new Map<
    string,
    { name: string; year: number; FIXED: number; BOARD: number; RECOMMEND: number; OTHER: number }
  >();
  for (const p of payments) {
    const k = `${p.personId}-${p.year}`;
    const row = byKey.get(k) ?? {
      name: persons.get(p.personId)!,
      year: p.year,
      FIXED: 0,
      BOARD: 0,
      RECOMMEND: 0,
      OTHER: 0,
    };
    row[p.kind as "FIXED"] += p._sum.amount ?? 0;
    byKey.set(k, row);
  }
  const limitRows = [...byKey.values()].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name, "ko"));
  const allowance: SheetSpec<(typeof limitRows)[number]> = {
    name: "수당_이사별",
    title: "비상임이사 연간 수당 현황",
    notes: [ALLOWANCE_NOTICE],
    columns: [
      { header: "연도", key: "year", type: "year" },
      { header: "이사", key: "name" },
      { header: "정액급여", key: "FIXED", type: "money", total: "sum" },
      { header: "이사회 회의수당", key: "BOARD", type: "money", total: "sum" },
      { header: "임원추천위원회 회의수당(입력분)", key: "RECOMMEND", type: "money", total: "sum" },
      { header: "기타", key: "OTHER", type: "money", total: "sum" },
      {
        header: "합계",
        key: "sum",
        type: "money",
        value: (r) => r.FIXED + r.BOARD + r.RECOMMEND + r.OTHER,
        total: "sum",
      },
      { header: "연간 한도", key: "limit", type: "money", value: () => 30_000_000 },
      {
        header: "소진율",
        key: "ratio",
        type: "percent",
        value: (r) => (r.FIXED + r.BOARD + r.RECOMMEND + r.OTHER) / 30_000_000,
      },
    ],
    rows: limitRows,
  };

  const sheets = [officers, attendance, allowance];
  const wb = buildWorkbook(sheets, {
    title: "공통 엑셀 모듈 시험 출력",
    conditions: [["조건", "전체 (샘플 데이터)"]],
    notes: [ALLOWANCE_NOTICE],
  });
  return excelResponse(wb, makeFilename("엑셀모듈시험", "전체"));
}
