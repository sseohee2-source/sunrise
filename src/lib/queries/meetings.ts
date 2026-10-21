import { prisma } from "@/lib/db";
import { isServingOn } from "@/lib/domain/appointment";
import { dateWhere, type Period } from "@/lib/period";

/** 개최일 기준 출석 대상: 재적이사 + 감사처럼 재적이사가 아니지만 참석하는 상임 임원 */
export async function attendeesOn(date: string) {
  const appts = await prisma.appointment.findMany({
    include: { person: true, position: true },
    orderBy: [{ position: { sortOrder: "asc" } }, { startDate: "asc" }],
  });
  const serving = appts.filter((a) => isServingOn(a, date));
  return {
    members: serving.filter((a) => a.position.countsAsMember),
    // 재적이사가 아닌 상임 임원(감사)은 참석 여부만 따로 기록
    observers: serving.filter((a) => !a.position.countsAsMember && a.position.category === "STANDING"),
  };
}

/** 연도별 다음 회차 번호 */
export async function nextSessionNo(year: number, excludeId?: number): Promise<number> {
  const max = await prisma.meeting.aggregate({
    where: { year, id: excludeId ? { not: excludeId } : undefined },
    _max: { sessionNo: true },
  });
  return (max._max.sessionNo ?? 0) + 1;
}

/** 조회 가능한 연도 목록 (데이터가 있는 연도 + 올해) */
export async function meetingYears(): Promise<number[]> {
  const rows = await prisma.meeting.findMany({ select: { year: true }, distinct: ["year"] });
  const years = new Set(rows.map((r) => r.year));
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

export type MeetingFilter = { period: Period; method?: string; status?: string };

/** 회차 목록 (안건 수·출석 현황 포함) */
export async function listMeetings(f: MeetingFilter) {
  const meetings = await prisma.meeting.findMany({
    where: { date: dateWhere(f.period), method: f.method, status: f.status },
    include: {
      region: true,
      agendas: { select: { type: true, result: true } },
      attendances: { select: { isMember: true, status: true } },
      _count: { select: { remarks: true } },
    },
    orderBy: [{ date: "asc" }, { sessionNo: "asc" }],
  });
  return meetings.map((m) => {
    const members = m.attendances.filter((a) => a.isMember);
    const present = members.filter((a) => a.status === "PRESENT").length;
    return {
      ...m,
      deliberations: m.agendas.filter((a) => a.type === "DELIBERATION").length,
      reports: m.agendas.filter((a) => a.type === "REPORT").length,
      memberCount: members.length,
      presentCount: present,
      attendanceRate: m.status === "DONE" && members.length ? present / members.length : null,
    };
  });
}

/** 장소 표시: 진주 · 본사 대회의실 */
export function placeText(m: { region: { name: string } | null; locationDetail: string | null }): string {
  return [m.region?.name, m.locationDetail].filter(Boolean).join(" · ");
}

export async function getMeeting(id: number) {
  return prisma.meeting.findUnique({
    where: { id },
    include: {
      region: true,
      requesters: { include: { appointment: { include: { person: true, position: true } } } },
      agendas: {
        include: { department: true, _count: { select: { recusals: true, remarks: true } } },
        orderBy: [{ type: "asc" }, { agendaNo: "asc" }],
      },
      attendances: { select: { isMember: true, status: true } },
      _count: { select: { remarks: true, payments: true, committeeMeetings: true } },
    },
  });
}

/** 안건 정렬: 심의 → 보고, 번호 순 ("DELIBERATION" < "REPORT" 이므로 문자열 정렬과 같음) */
export const AGENDA_ORDER = [{ type: "asc" as const }, { agendaNo: "asc" as const }];

/** 구분별 다음 안건 번호 */
export async function nextAgendaNo(meetingId: number, type: string): Promise<number> {
  const max = await prisma.agenda.aggregate({ where: { meetingId, type }, _max: { agendaNo: true } });
  return (max._max.agendaNo ?? 0) + 1;
}

/**
 * 출석 명단을 개최일 기준 재임자로 맞춤
 * - 새로 재임 대상이 된 임원은 추가(기본 출석)
 * - 더 이상 대상이 아닌 임원은 삭제 (의결제외로 지정된 경우는 남기고 경고)
 */
export async function syncAttendanceRoster(
  meetingId: number,
): Promise<{ added: string[]; removed: string[]; kept: string[] }> {
  const m = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { attendances: { include: { appointment: { include: { person: true } } } } },
  });
  const { members, observers } = await attendeesOn(m.date);
  const targets = [...members, ...observers];
  const targetIds = new Set(targets.map((a) => a.id));
  const existing = new Set(m.attendances.map((a) => a.appointmentId));
  const added: string[] = [];
  const removed: string[] = [];
  const kept: string[] = [];
  for (const a of targets) {
    if (existing.has(a.id)) continue;
    await prisma.attendance.create({
      data: { meetingId, appointmentId: a.id, isMember: a.position.countsAsMember, status: "PRESENT" },
    });
    added.push(a.person.name);
  }
  for (const at of m.attendances) {
    if (targetIds.has(at.appointmentId)) continue;
    const recused = await prisma.agendaRecusal.count({
      where: { appointmentId: at.appointmentId, agenda: { meetingId } },
    });
    if (recused > 0) {
      kept.push(at.appointment.person.name);
      continue;
    }
    await prisma.attendance.delete({ where: { id: at.id } });
    removed.push(at.appointment.person.name);
  }
  return { added, removed, kept };
}
