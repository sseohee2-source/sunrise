"use server";

import { revalidatePath } from "next/cache";

import { isDate, nn, type ActionResult } from "@/lib/action-result";
import { logEvent, logUpdate } from "@/lib/changelog";
import { fmtDate, termEnd } from "@/lib/date";
import { prisma } from "@/lib/db";
import { describeViolation, findQuotaViolations } from "@/lib/queries/officers";

export type OfficerInput = {
  appointmentId?: number;
  /** 기존 인물이면 id, 신임이면 undefined */
  personId?: number;
  person: { name: string; education: string; career: string; note: string };
  positionId: number;
  startDate: string;
  endDate: string;
  retiredDate: string;
  isReappointment: boolean;
  note: string;
};

const APPT_FIELDS = {
  positionId: "직책",
  startDate: "임기 시작일",
  endDate: "임기 종료일",
  retiredDate: "실제 퇴임일",
  isReappointment: "연임 여부",
  note: "비고",
} as const;

function revalidateOfficers() {
  revalidatePath("/officers", "layout");
  revalidatePath("/");
}

/** 임원(인물 + 재임) 등록·수정 */
export async function saveOfficer(input: OfficerInput): Promise<ActionResult> {
  const name = input.person.name.trim();
  if (!name) return { ok: false, error: "성명을 입력하세요." };
  if (!input.positionId) return { ok: false, error: "직책을 선택하세요." };
  const position = await prisma.position.findUnique({ where: { id: input.positionId } });
  if (!position) return { ok: false, error: "직책을 찾을 수 없습니다." };
  if (!isDate(input.startDate)) return { ok: false, error: "임기 시작일을 입력하세요." };
  const endDate = nn(input.endDate);
  // 당연직이사처럼 기본 임기가 없는 직책은 종료일을 비워 둘 수 있음 (해당 직책 재임기간)
  if (!endDate && position.termYears != null) return { ok: false, error: "임기 종료일을 입력하세요." };
  if (endDate && !isDate(endDate)) return { ok: false, error: "임기 종료일 형식이 올바르지 않습니다." };
  if (endDate && endDate < input.startDate) return { ok: false, error: "임기 종료일이 시작일보다 빠릅니다." };
  const retiredDate = nn(input.retiredDate);
  if (retiredDate && !isDate(retiredDate)) return { ok: false, error: "실제 퇴임일 형식이 올바르지 않습니다." };
  if (retiredDate && retiredDate < input.startDate)
    return { ok: false, error: "실제 퇴임일이 임기 시작일보다 빠릅니다." };

  const personData = {
    name,
    education: nn(input.person.education),
    career: nn(input.person.career),
    note: nn(input.person.note),
  };
  const apptData = {
    positionId: input.positionId,
    startDate: input.startDate,
    endDate,
    retiredDate,
    isReappointment: input.isReappointment,
    note: nn(input.note),
  };

  await prisma.$transaction(async (tx) => {
    let personId = input.personId;
    if (personId) {
      const before = await tx.person.findUniqueOrThrow({ where: { id: personId } });
      await tx.person.update({ where: { id: personId }, data: personData });
      await logUpdate(tx, "Person", personId, `${name} 인적사항`, before, personData, {
        name: "성명",
        education: "학력",
        career: "주요경력",
        note: "비고",
      });
    } else {
      personId = (await tx.person.create({ data: personData })).id;
    }

    const label = `${name} / ${position.name}`;
    if (input.appointmentId) {
      const before = await tx.appointment.findUniqueOrThrow({ where: { id: input.appointmentId } });
      await tx.appointment.update({ where: { id: input.appointmentId }, data: { ...apptData, personId } });
      await logUpdate(tx, "Appointment", input.appointmentId, label, before, apptData, APPT_FIELDS);
    } else {
      const created = await tx.appointment.create({ data: { ...apptData, personId } });
      await logEvent(
        tx,
        "Appointment",
        created.id,
        label,
        "CREATE",
        `${fmtDate(apptData.startDate)}~${fmtDate(apptData.endDate)}`,
      );
    }
  });

  // 경고 (저장은 그대로 함)
  const warnings: string[] = [];
  // 정관 제7조 임기: 이사장 3년, 이사·감사 2년, 연임은 1년 단위
  if (position.termYears != null && endDate) {
    const years = input.isReappointment ? 1 : position.termYears;
    const expected = termEnd(input.startDate, years);
    if (endDate !== expected) {
      warnings.push(
        `${input.isReappointment ? "연임(1년 단위)" : `${position.name} 임기(${years}년)`} 기준 종료일은 ${fmtDate(expected)}인데 ${fmtDate(endDate)}로 입력되었습니다.`,
      );
    }
  }
  // 정원 초과 기간
  const appts = await prisma.appointment.findMany({
    where: { positionId: input.positionId },
    include: { person: true },
  });
  warnings.push(
    ...findQuotaViolations(appts, position.quota).map((v) => describeViolation(position.name, position.quota, v)),
  );

  revalidateOfficers();
  return { ok: true, warnings };
}

/** 재임 기록 삭제 (출석 등 이사회 기록이 연결되어 있으면 삭제하지 않음) */
export async function deleteAppointment(id: number): Promise<ActionResult> {
  const a = await prisma.appointment.findUnique({
    where: { id },
    include: {
      person: true,
      position: true,
      _count: { select: { attendances: true, recusals: true, convocations: true } },
    },
  });
  if (!a) return { ok: false, error: "이미 삭제된 기록입니다." };
  const linked = a._count.attendances + a._count.recusals + a._count.convocations;
  if (linked > 0) {
    return {
      ok: false,
      error: `이 재임 기록에 이사회 출석·의결제외 기록 ${linked}건이 연결되어 있어 삭제할 수 없습니다. 퇴임 처리가 필요하면 '실제 퇴임일'을 입력하세요.`,
    };
  }
  await prisma.$transaction(async (tx) => {
    await tx.appointment.delete({ where: { id } });
    await logEvent(
      tx,
      "Appointment",
      id,
      `${a.person.name} / ${a.position.name}`,
      "DELETE",
      `${fmtDate(a.startDate)}~${fmtDate(a.endDate)}`,
    );
    // 다른 기록이 전혀 없는 인물은 함께 정리
    const p = await tx.person.findUnique({
      where: { id: a.personId },
      include: {
        _count: {
          select: {
            appointments: true,
            remarks: true,
            payments: true,
            committeeAssignments: true,
            committeeAttendances: true,
          },
        },
      },
    });
    if (p && Object.values(p._count).every((n) => n === 0)) await tx.person.delete({ where: { id: p.id } });
  });
  revalidateOfficers();
  return { ok: true };
}
