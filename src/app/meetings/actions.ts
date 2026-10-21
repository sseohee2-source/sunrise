"use server";

import { revalidatePath } from "next/cache";

import { isDate, nn, type ActionResult } from "@/lib/action-result";
import { logEvent, logUpdate } from "@/lib/changelog";
import {
  AGENDA_RESULT,
  AGENDA_TYPE,
  CONVOCATION,
  MEETING_METHOD,
  MEETING_STATUS,
  RESULTS_BY_TYPE,
  agendaLabel,
  label,
  sessionLabel,
} from "@/lib/codes";
import { fmtDate } from "@/lib/date";
import { prisma } from "@/lib/db";
import { attendeesOn, nextSessionNo, syncAttendanceRoster } from "@/lib/queries/meetings";

function revalidateMeetings() {
  revalidatePath("/", "layout");
}

// ───────────── 회차 ─────────────

export type MeetingInput = {
  id?: number;
  year: number;
  sessionNo: number;
  date: string;
  method: string;
  methodOther: string;
  regionId: number | null;
  locationDetail: string;
  isHeadOffice: boolean;
  convocation: string;
  /** 재적이사 1/3 이상 요구 시 요구한 이사(재임 id) */
  requesterIds: number[];
  status: string;
  note: string;
};

const MEETING_FIELDS = {
  year: "연도",
  sessionNo: "회차",
  date: "개최일",
  method: "개최 방법",
  methodOther: "개최 방법(기타)",
  locationDetail: "상세 위치",
  isHeadOffice: "진주 본사 개최",
  convocation: "소집 근거",
  status: "진행 상태",
  note: "비고",
} as const;

export async function saveMeeting(input: MeetingInput): Promise<ActionResult> {
  if (!isDate(input.date)) return { ok: false, error: "개최일을 입력하세요." };
  if (!Number.isInteger(input.year) || input.year < 1900) return { ok: false, error: "연도를 확인하세요." };
  if (!Number.isInteger(input.sessionNo) || input.sessionNo < 1)
    return { ok: false, error: "회차는 1 이상의 숫자로 입력하세요." };
  if (!(input.method in MEETING_METHOD)) return { ok: false, error: "개최 방법을 선택하세요." };
  if (input.method === "OTHER" && !input.methodOther.trim())
    return { ok: false, error: "기타 개최 방법을 입력하세요. (예: 화상회의)" };
  if (!(input.convocation in CONVOCATION)) return { ok: false, error: "소집 근거를 선택하세요." };
  if (!(input.status in MEETING_STATUS)) return { ok: false, error: "진행 상태를 선택하세요." };

  const data = {
    year: input.year,
    sessionNo: input.sessionNo,
    date: input.date,
    method: input.method,
    methodOther: input.method === "OTHER" ? nn(input.methodOther) : null,
    regionId: input.regionId || null,
    locationDetail: nn(input.locationDetail),
    isHeadOffice: input.isHeadOffice,
    convocation: input.convocation,
    status: input.status,
    note: nn(input.note),
  };
  const requesterIds = input.convocation === "MEMBER_REQUEST" ? [...new Set(input.requesterIds)] : [];
  const warnings: string[] = [];
  const name = sessionLabel(input.year, input.sessionNo);

  // 같은 연도에 같은 회차 번호
  const dup = await prisma.meeting.findFirst({
    where: { year: input.year, sessionNo: input.sessionNo, id: input.id ? { not: input.id } : undefined },
  });
  if (dup) warnings.push(`${name}가 이미 있습니다 (${fmtDate(dup.date)}). 회차 번호를 확인하세요.`);
  if (String(input.year) !== input.date.slice(0, 4))
    warnings.push(`연도(${input.year})와 개최일(${fmtDate(input.date)})의 연도가 다릅니다.`);

  // 1/3 이상 요구 확인
  const { members } = await attendeesOn(input.date);
  if (input.convocation === "MEMBER_REQUEST") {
    const memberIds = new Set(members.map((m) => m.id));
    const valid = requesterIds.filter((id) => memberIds.has(id));
    if (valid.length * 3 < members.length) {
      warnings.push(
        `소집 요구 이사 ${valid.length}명이 재적이사 ${members.length}명의 1/3(${Math.ceil(members.length / 3)}명)에 못 미칩니다.`,
      );
    }
    if (valid.length !== requesterIds.length)
      warnings.push("개최일 기준 재적이사가 아닌 이사가 요구 이사로 선택되어 있습니다.");
  }

  let id = input.id;
  let dateChanged = false;
  await prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.meeting.findUniqueOrThrow({ where: { id } });
      dateChanged = before.date !== input.date;
      await tx.meeting.update({ where: { id }, data });
      await logUpdate(tx, "Meeting", id, `${name} 이사회`, before, data, MEETING_FIELDS, {
        method: (v) => label(MEETING_METHOD, String(v)),
        convocation: (v) => label(CONVOCATION, String(v)),
        status: (v) => label(MEETING_STATUS, String(v)),
      });
      await tx.convocationRequester.deleteMany({ where: { meetingId: id } });
    } else {
      id = (await tx.meeting.create({ data })).id;
      await logEvent(tx, "Meeting", id, `${name} 이사회`, "CREATE", fmtDate(input.date));
    }
    if (requesterIds.length) {
      await tx.convocationRequester.createMany({
        data: requesterIds.map((appointmentId) => ({ meetingId: id!, appointmentId })),
      });
    }
  });

  // 출석 명단: 새 회차는 개최일 기준 재적이사로 자동 생성, 개최일이 바뀌면 다시 맞춤
  if (!input.id || dateChanged) {
    const r = await syncAttendanceRoster(id!);
    if (input.id) {
      if (r.added.length) warnings.push(`개최일 변경으로 출석 명단에 추가: ${r.added.join(", ")}`);
      if (r.removed.length) warnings.push(`개최일 변경으로 출석 명단에서 제외: ${r.removed.join(", ")}`);
    }
    if (r.kept.length)
      warnings.push(
        `개최일 기준 재임자가 아니지만 의결제외로 지정되어 있어 출석 명단에 남겨 둔 이사: ${r.kept.join(", ")}`,
      );
  }

  revalidateMeetings();
  return { ok: true, id, warnings };
}

export async function deleteMeeting(id: number): Promise<ActionResult> {
  const m = await prisma.meeting.findUnique({ where: { id } });
  if (!m) return { ok: false, error: "이미 삭제된 회차입니다." };
  await prisma.$transaction(async (tx) => {
    // 수당 내역은 지우지 않고 회차 연결만 끊김 (onDelete: SetNull)
    await tx.meeting.delete({ where: { id } });
    await logEvent(tx, "Meeting", id, `${sessionLabel(m.year, m.sessionNo)} 이사회`, "DELETE", fmtDate(m.date));
  });
  revalidateMeetings();
  return { ok: true };
}

// ───────────── 안건 ─────────────

export type AgendaInput = {
  id?: number;
  meetingId: number;
  type: string;
  agendaNo: number;
  title: string;
  departmentId: number | null;
  presenter: string;
  contact: string;
  result: string;
  amendment: string;
  description: string;
  keywords: string;
};

const AGENDA_FIELDS = {
  type: "구분",
  agendaNo: "안건 번호",
  title: "안건명",
  departmentId: "담당부서",
  presenter: "발표자",
  contact: "담당자",
  result: "결과",
  amendment: "수정 내용",
  description: "설명",
  keywords: "키워드",
} as const;

/** 키워드 정리: 쉼표로 나눠 공백 제거·중복 제거 */
function normalizeKeywords(k: string): string | null {
  const list = [
    ...new Set(
      k
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  return list.length ? list.join(",") : null;
}

export async function saveAgenda(input: AgendaInput): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "안건명을 입력하세요." };
  if (!(input.type in AGENDA_TYPE)) return { ok: false, error: "구분(심의/보고)을 선택하세요." };
  if (!Number.isInteger(input.agendaNo) || input.agendaNo < 1)
    return { ok: false, error: "안건 번호는 1 이상의 숫자로 입력하세요." };
  const result = nn(input.result);
  if (result && !(RESULTS_BY_TYPE[input.type as keyof typeof RESULTS_BY_TYPE] as readonly string[]).includes(result)) {
    return {
      ok: false,
      error: `${label(AGENDA_TYPE, input.type)} 안건에는 '${label(AGENDA_RESULT, result)}' 결과를 쓸 수 없습니다.`,
    };
  }
  const meeting = await prisma.meeting.findUnique({ where: { id: input.meetingId } });
  if (!meeting) return { ok: false, error: "회차를 찾을 수 없습니다." };

  const data = {
    meetingId: input.meetingId,
    type: input.type,
    agendaNo: input.agendaNo,
    title,
    departmentId: input.departmentId || null,
    presenter: nn(input.presenter),
    contact: nn(input.contact),
    result,
    amendment: result === "AMENDED" ? nn(input.amendment) : null,
    description: nn(input.description),
    keywords: normalizeKeywords(input.keywords),
  };
  const warnings: string[] = [];
  if (result === "AMENDED" && !data.amendment) warnings.push("수정의결 안건의 수정 내용이 비어 있습니다.");
  const dup = await prisma.agenda.findFirst({
    where: {
      meetingId: input.meetingId,
      type: input.type,
      agendaNo: input.agendaNo,
      id: input.id ? { not: input.id } : undefined,
    },
  });
  if (dup) warnings.push(`같은 회차에 ${agendaLabel(input.type, input.agendaNo)}가 이미 있습니다: ${dup.title}`);

  const ctx = `${sessionLabel(meeting.year, meeting.sessionNo)} ${agendaLabel(input.type, input.agendaNo)} ${title}`;
  let id = input.id;
  if (id) {
    const before = await prisma.agenda.findUniqueOrThrow({ where: { id } });
    await prisma.agenda.update({ where: { id }, data });
    const depts = new Map((await prisma.department.findMany()).map((d) => [d.id, d.name]));
    await logUpdate(prisma, "Agenda", id, ctx, before, data, AGENDA_FIELDS, {
      type: (v) => label(AGENDA_TYPE, String(v)),
      result: (v) => label(AGENDA_RESULT, String(v)),
      departmentId: (v) => depts.get(Number(v)) ?? String(v),
    });
  } else {
    id = (await prisma.agenda.create({ data })).id;
    await logEvent(prisma, "Agenda", id, ctx, "CREATE");
  }
  revalidateMeetings();
  return { ok: true, id, warnings };
}

export async function deleteAgenda(id: number): Promise<ActionResult> {
  const a = await prisma.agenda.findUnique({ where: { id }, include: { meeting: true } });
  if (!a) return { ok: false, error: "이미 삭제된 안건입니다." };
  await prisma.agenda.delete({ where: { id } });
  await logEvent(
    prisma,
    "Agenda",
    id,
    `${sessionLabel(a.meeting.year, a.meeting.sessionNo)} ${agendaLabel(a.type, a.agendaNo)} ${a.title}`,
    "DELETE",
    a.result ? label(AGENDA_RESULT, a.result) : undefined,
  );
  revalidateMeetings();
  return { ok: true };
}

/** 구분 내 번호를 1부터 차례로 다시 매김 */
export async function renumberAgendas(meetingId: number): Promise<ActionResult> {
  const agendas = await prisma.agenda.findMany({
    where: { meetingId },
    orderBy: [{ type: "asc" }, { agendaNo: "asc" }, { id: "asc" }],
  });
  const counter: Record<string, number> = {};
  for (const a of agendas) {
    const no = (counter[a.type] = (counter[a.type] ?? 0) + 1);
    if (a.agendaNo !== no) await prisma.agenda.update({ where: { id: a.id }, data: { agendaNo: no } });
  }
  revalidateMeetings();
  return { ok: true };
}

// ───────────── 입력 화면 보조 ─────────────

/** 개최일 기준 재적이사 명단 (소집 요구 이사 선택용) */
export async function membersOnDate(date: string) {
  if (!isDate(date)) return [];
  const { members } = await attendeesOn(date);
  return members.map((a) => ({ id: a.id, name: a.person.name, position: a.position.name }));
}

/** 연도별 다음 회차 번호 */
export async function suggestSessionNo(year: number, excludeId?: number) {
  return nextSessionNo(year, excludeId);
}
