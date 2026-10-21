import type { Appointment, Person, Position } from "@prisma/client";

import { addDays, fmtDate } from "@/lib/date";
import { prisma } from "@/lib/db";
import { apptStatus, isExpiringSoon, isServingOn, type ApptStatus } from "@/lib/domain/appointment";

export type ApptWithPerson = Appointment & { person: Person };

export type RosterEntry = {
  position: Position;
  /** 기준일 재임자 */
  serving: (ApptWithPerson & { status: ApptStatus; expiringSoon: boolean })[];
  vacancies: number;
  overQuota: boolean;
};

/** 기준일 임원 현황 (직책 표시 순서대로, 결원 수 포함) */
export async function getRoster(on: string): Promise<RosterEntry[]> {
  const positions = await prisma.position.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { appointments: { include: { person: true }, orderBy: { startDate: "asc" } } },
  });
  return positions
    .map(({ appointments, ...position }) => {
      const serving = appointments
        .filter((a) => isServingOn(a, on))
        .map((a) => ({ ...a, status: apptStatus(a, on), expiringSoon: isExpiringSoon(a, on) }));
      return {
        position,
        serving,
        vacancies: Math.max(0, position.quota - serving.length),
        overQuota: serving.length > position.quota,
      };
    })
    .filter((r) => r.position.isActive || r.serving.length > 0);
}

/** 현황표·명단 출력용 행 (재임자 + 결원 행) */
export type RosterRow = {
  category: string;
  positionName: string;
  appt: RosterEntry["serving"][number] | null; // null = 결원
};

export function rosterRows(roster: RosterEntry[], includeVacancies = true): RosterRow[] {
  const rows: RosterRow[] = [];
  for (const r of roster) {
    for (const a of r.serving) rows.push({ category: r.position.category, positionName: r.position.name, appt: a });
    if (includeVacancies) {
      for (let i = 0; i < r.vacancies; i++) rows.push({ category: r.position.category, positionName: r.position.name, appt: null });
    }
  }
  return rows;
}

export type QuotaViolation = { from: string; to: string | null; count: number; names: string[] };

/**
 * 같은 직책에서 동시 재임 인원이 정원을 넘는 기간 찾기
 * (실제 퇴임일이 없으면 계속 재임 중으로 봄)
 */
export function findQuotaViolations(appts: ApptWithPerson[], quota: number): QuotaViolation[] {
  const points = new Set<string>();
  for (const a of appts) {
    points.add(a.startDate);
    if (a.retiredDate) points.add(addDays(a.retiredDate, 1));
  }
  const sorted = [...points].sort();
  const result: QuotaViolation[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const serving = appts.filter((a) => isServingOn(a, d));
    if (serving.length > quota) {
      const to = i + 1 < sorted.length ? addDays(sorted[i + 1], -1) : null;
      const names = serving.map((a) => a.person.name);
      const prev = result[result.length - 1];
      // 같은 사람들로 이어지는 기간은 합침
      if (prev && prev.to && addDays(prev.to, 1) === d && prev.names.join() === names.join()) prev.to = to;
      else result.push({ from: d, to, count: serving.length, names });
    }
  }
  return result;
}

export function describeViolation(positionName: string, quota: number, v: QuotaViolation): string {
  return `${positionName}(정원 ${quota}명): ${fmtDate(v.from)}~${v.to ? fmtDate(v.to) : "현재"} 기간에 ${v.count}명 재임 (${v.names.join(", ")})`;
}

/** 전체 직책의 정원 초과 기간 */
export async function getAllQuotaWarnings(): Promise<string[]> {
  const positions = await prisma.position.findMany({
    orderBy: { sortOrder: "asc" },
    include: { appointments: { include: { person: true } } },
  });
  return positions.flatMap((p) =>
    findQuotaViolations(p.appointments, p.quota).map((v) => describeViolation(p.name, p.quota, v)),
  );
}

export type HistoryFilter = { positionId?: number; q?: string; from?: string; to?: string; status?: string };

/** 역대 임원 리스트 (필터 적용) */
export async function getHistory(f: HistoryFilter, on: string) {
  const appts = await prisma.appointment.findMany({
    where: {
      positionId: f.positionId,
      person: f.q ? { name: { contains: f.q } } : undefined,
    },
    include: { person: true, position: true },
    orderBy: [{ position: { sortOrder: "asc" } }, { startDate: "asc" }],
  });
  return appts
    .filter((a) => {
      // 재임기간이 조회 기간과 겹치는지
      const end = a.retiredDate ?? "9999-12-31";
      if (f.from && end < f.from) return false;
      if (f.to && a.startDate > f.to) return false;
      if (f.status === "serving" && !isServingOn(a, on)) return false;
      if (f.status === "retired" && apptStatus(a, on) !== "RETIRED") return false;
      return true;
    })
    .map((a) => ({ ...a, status: apptStatus(a, on) }));
}

export function parseHistoryFilter(sp: Record<string, string | string[] | undefined>): HistoryFilter {
  const s = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  return {
    positionId: s("position") ? Number(s("position")) : undefined,
    q: s("q"),
    from: s("from"),
    to: s("to"),
    status: s("status"),
  };
}

/** 임원 등록·수정 창에 필요한 선택지 */
export async function getOfficerFormOptions() {
  const [positions, persons] = await Promise.all([
    prisma.position.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.person.findMany({
      orderBy: { name: "asc" },
      include: { appointments: { include: { position: true }, orderBy: { startDate: "asc" } } },
    }),
  ]);
  return {
    positions: positions.map((p) => ({ id: p.id, name: p.name, category: p.category, termYears: p.termYears })),
    persons: persons.map((p) => ({
      id: p.id,
      name: p.name,
      education: p.education,
      career: p.career,
      note: p.note,
      summary:
        p.appointments.map((a) => `${a.position.name} ${a.startDate.slice(2, 4)}~${(a.retiredDate ?? a.endDate ?? "    현재").slice(2, 4)}`).join(", ") ||
        "재임 기록 없음",
      positionIds: [...new Set(p.appointments.map((a) => a.positionId))],
    })),
  };
}
