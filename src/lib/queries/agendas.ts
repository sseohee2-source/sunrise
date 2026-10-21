import { sp, type SearchParams } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { dateWhere, parsePeriod, type Period } from "@/lib/period";

export type AgendaFilter = {
  period: Period;
  q?: string;
  type?: string;
  result?: string;
  departmentId?: number;
  method?: string;
  /** "1" = 의결제외(이해관계 이사)가 있는 안건만 */
  recusal?: string;
  /** 특정 회차의 안건만 (지정하면 기간 조건 무시) */
  meetingId?: number;
};

export function parseAgendaFilter(params: SearchParams): AgendaFilter {
  const dept = sp(params, "dept");
  return {
    period: parsePeriod(params),
    q: sp(params, "q"),
    type: sp(params, "type"),
    result: sp(params, "result"),
    departmentId: dept ? Number(dept) : undefined,
    method: sp(params, "method"),
    recusal: sp(params, "recusal"),
    meetingId: sp(params, "meeting") ? Number(sp(params, "meeting")) : undefined,
  };
}

export type MatchField = "안건명" | "설명" | "키워드";

/** 키워드 문자열 → 배열 */
export function splitKeywords(k: string | null | undefined): string[] {
  return (k ?? "")
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 통합 검색: 띄어쓰기로 나눈 단어가 모두 (안건명·설명·키워드 중 어디에든) 있어야 일치.
 * 일치한 위치를 함께 돌려줌.
 */
export function matchAgenda(
  a: { title: string; description: string | null; keywords: string | null },
  q: string | undefined,
): MatchField[] | null {
  if (!q) return [];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const fields: [MatchField, string][] = [
    ["안건명", a.title.toLowerCase()],
    ["설명", (a.description ?? "").toLowerCase()],
    ["키워드", splitKeywords(a.keywords).join(" ").toLowerCase()],
  ];
  const hit = new Set<MatchField>();
  for (const t of terms) {
    const where = fields.filter(([, text]) => text.includes(t)).map(([f]) => f);
    if (where.length === 0) return null;
    where.forEach((f) => hit.add(f));
  }
  return fields.map(([f]) => f).filter((f) => hit.has(f));
}

export async function searchAgendas(f: AgendaFilter) {
  const rows = await prisma.agenda.findMany({
    where: {
      type: f.type,
      result: f.result === "NONE" ? null : f.result,
      departmentId: f.departmentId,
      meetingId: f.meetingId,
      meeting: f.meetingId ? undefined : { date: dateWhere(f.period), method: f.method },
      recusals: f.recusal === "1" ? { some: {} } : undefined,
    },
    include: {
      meeting: { include: { region: true } },
      department: true,
      _count: { select: { recusals: true } },
    },
    orderBy: [{ meeting: { date: "asc" } }, { type: "asc" }, { agendaNo: "asc" }],
  });
  return rows.flatMap((a) => {
    const matched = matchAgenda(a, f.q);
    return matched ? [{ ...a, matched }] : [];
  });
}

export async function departmentOptions() {
  return prisma.department.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
}
