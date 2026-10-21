"use server";

import { revalidatePath } from "next/cache";

import { isDate, nn, type ActionResult } from "@/lib/action-result";
import { logEvent, logUpdate } from "@/lib/changelog";
import { prisma } from "@/lib/db";
import { fmtMoney } from "@/lib/date";
import { getProRata } from "@/lib/queries/settings";

function done(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 정렬 순서 위/아래 이동 (전체를 10 단위로 다시 매김) */
async function reorder(
  list: { id: number }[],
  id: number,
  dir: -1 | 1,
  update: (id: number, sortOrder: number) => Promise<unknown>,
) {
  const ids = list.map((x) => x.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (const [k, x] of ids.entries()) await update(x, (k + 1) * 10);
}

// ───────────── 직책 마스터 ─────────────

export type PositionInput = {
  id?: number;
  category: string;
  name: string;
  quota: number;
  countsAsMember: boolean;
  allowanceEligible: boolean;
  isActive: boolean;
  note: string;
};

export async function savePosition(input: PositionInput): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "직책명을 입력하세요." };
  if (!["STANDING", "NON_STANDING"].includes(input.category)) return { ok: false, error: "구분을 선택하세요." };
  if (!Number.isInteger(input.quota) || input.quota < 0) return { ok: false, error: "정원은 0 이상의 정수로 입력하세요." };
  const dup = await prisma.position.findFirst({ where: { name, id: input.id ? { not: input.id } : undefined } });
  if (dup) return { ok: false, error: `'${name}' 직책이 이미 있습니다.` };
  const data = {
    category: input.category,
    name,
    quota: input.quota,
    countsAsMember: input.countsAsMember,
    allowanceEligible: input.allowanceEligible,
    isActive: input.isActive,
    note: nn(input.note),
  };
  if (input.id) {
    const before = await prisma.position.findUniqueOrThrow({ where: { id: input.id } });
    await prisma.position.update({ where: { id: input.id }, data });
    await logUpdate(prisma, "Position", input.id, `직책 ${name}`, before, data, {
      category: "구분",
      name: "직책명",
      quota: "정원",
      countsAsMember: "재적이사 포함",
      allowanceEligible: "수당 지급 대상",
      isActive: "사용",
    });
  } else {
    const max = await prisma.position.aggregate({ _max: { sortOrder: true } });
    await prisma.position.create({ data: { ...data, sortOrder: (max._max.sortOrder ?? 0) + 10 } });
  }
  return done();
}

export async function deletePosition(id: number): Promise<ActionResult> {
  const n = await prisma.appointment.count({ where: { positionId: id } });
  if (n > 0) return { ok: false, error: `이 직책의 재임 기록이 ${n}건 있어 삭제할 수 없습니다. 더 이상 쓰지 않으면 '사용 안 함'으로 바꾸세요.` };
  await prisma.position.delete({ where: { id } });
  return done();
}

export async function movePosition(id: number, dir: -1 | 1): Promise<ActionResult> {
  const list = await prisma.position.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  await reorder(list, id, dir, (x, sortOrder) => prisma.position.update({ where: { id: x }, data: { sortOrder } }));
  return done();
}

// ───────────── 부서·지역·소위원회 (이름 목록) ─────────────

export type SimpleKind = "department" | "region" | "committee";
export type SimpleInput = { id?: number; name: string; isActive: boolean; isHeadOffice?: boolean };

const SIMPLE_LABEL: Record<SimpleKind, string> = { department: "부서", region: "지역", committee: "소위원회" };

// Prisma 모델별 위임 객체 (세 모델 모두 id·name·sortOrder·isActive 를 가짐)
function model(kind: SimpleKind) {
  const m = { department: prisma.department, region: prisma.region, committee: prisma.committee }[kind];
  return m as unknown as {
    findFirst(args: object): Promise<{ id: number } | null>;
    findMany(args: object): Promise<{ id: number }[]>;
    aggregate(args: object): Promise<{ _max: { sortOrder: number | null } }>;
    create(args: object): Promise<unknown>;
    update(args: object): Promise<unknown>;
    delete(args: object): Promise<unknown>;
  };
}

export async function saveSimple(kind: SimpleKind, input: SimpleInput): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: `${SIMPLE_LABEL[kind]} 이름을 입력하세요.` };
  const m = model(kind);
  const dup = await m.findFirst({ where: { name, id: input.id ? { not: input.id } : undefined } });
  if (dup) return { ok: false, error: `'${name}'이(가) 이미 있습니다.` };
  const data: Record<string, unknown> = { name, isActive: input.isActive };
  if (kind === "region") data.isHeadOffice = !!input.isHeadOffice;
  if (input.id) await m.update({ where: { id: input.id }, data });
  else {
    const max = await m.aggregate({ _max: { sortOrder: true } });
    await m.create({ data: { ...data, sortOrder: (max._max.sortOrder ?? 0) + 10 } });
  }
  return done();
}

export async function deleteSimple(kind: SimpleKind, id: number): Promise<ActionResult> {
  let used = 0;
  if (kind === "department") {
    used =
      (await prisma.agenda.count({ where: { departmentId: id } })) +
      (await prisma.remark.count({ where: { actionDepartmentId: id } })) +
      (await prisma.committeeAgenda.count({ where: { departmentId: id } }));
  } else if (kind === "region") {
    used =
      (await prisma.meeting.count({ where: { regionId: id } })) +
      (await prisma.committeeMeeting.count({ where: { regionId: id } }));
  } else {
    used =
      (await prisma.committeeAssignment.count({ where: { committeeId: id } })) +
      (await prisma.committeeMeeting.count({ where: { committeeId: id } }));
  }
  if (used > 0) {
    return { ok: false, error: `사용 중인 기록이 ${used}건 있어 삭제할 수 없습니다. 더 이상 쓰지 않으면 '사용 안 함'으로 바꾸세요.` };
  }
  await model(kind).delete({ where: { id } });
  return done();
}

export async function moveSimple(kind: SimpleKind, id: number, dir: -1 | 1): Promise<ActionResult> {
  const m = model(kind);
  const list = await m.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  await reorder(list, id, dir, (x, sortOrder) => m.update({ where: { id: x }, data: { sortOrder } }));
  return done();
}

// ───────────── 수당 기준 ─────────────

export type RateInput = {
  id?: number;
  effectiveFrom: string;
  monthlyFixed: number;
  faceFee: number;
  writtenFee: number;
  annualLimit: number;
  warningMargin: number;
  note: string;
};

const RATE_FIELDS = {
  effectiveFrom: "적용 시작일",
  monthlyFixed: "정액급여(월)",
  faceFee: "대면 회의수당",
  writtenFee: "서면 회의수당",
  annualLimit: "연간 한도",
  warningMargin: "한도 경고 여유분",
  note: "비고",
} as const;

export async function saveRate(input: RateInput): Promise<ActionResult> {
  if (!isDate(input.effectiveFrom)) return { ok: false, error: "적용 시작일을 입력하세요." };
  for (const k of ["monthlyFixed", "faceFee", "writtenFee", "annualLimit", "warningMargin"] as const) {
    if (!Number.isInteger(input[k]) || input[k] < 0) return { ok: false, error: `${RATE_FIELDS[k]}은(는) 0 이상의 금액(원)으로 입력하세요.` };
  }
  if (input.warningMargin >= input.annualLimit) return { ok: false, error: "한도 경고 여유분은 연간 한도보다 작아야 합니다." };
  const dup = await prisma.allowanceRate.findFirst({
    where: { effectiveFrom: input.effectiveFrom, id: input.id ? { not: input.id } : undefined },
  });
  if (dup) return { ok: false, error: "같은 적용 시작일의 기준이 이미 있습니다." };
  const data = {
    effectiveFrom: input.effectiveFrom,
    monthlyFixed: input.monthlyFixed,
    faceFee: input.faceFee,
    writtenFee: input.writtenFee,
    annualLimit: input.annualLimit,
    warningMargin: input.warningMargin,
    note: nn(input.note),
  };
  const warnings: string[] = [];
  if (input.id) {
    const before = await prisma.allowanceRate.findUniqueOrThrow({ where: { id: input.id } });
    await prisma.allowanceRate.update({ where: { id: input.id }, data });
    const money = (v: unknown) => `${fmtMoney(Number(v))}원`;
    await logUpdate(prisma, "AllowanceRate", input.id, `수당 기준(${input.effectiveFrom}~)`, before, data, RATE_FIELDS, {
      monthlyFixed: money,
      faceFee: money,
      writtenFee: money,
      annualLimit: money,
      warningMargin: money,
    });
    const used = await prisma.allowancePayment.count({ where: { rateId: input.id } });
    if (used > 0) {
      warnings.push(`이 기준으로 이미 만든 지급 내역 ${used}건의 금액은 바뀌지 않습니다. 기준 금액이 바뀐 것이라면 수정 대신 새 적용일로 추가 등록하세요.`);
    }
  } else {
    const created = await prisma.allowanceRate.create({ data });
    await logEvent(prisma, "AllowanceRate", created.id, `수당 기준(${input.effectiveFrom}~)`, "CREATE");
  }
  revalidatePath("/", "layout");
  return { ok: true, warnings };
}

export async function deleteRate(id: number): Promise<ActionResult> {
  const used = await prisma.allowancePayment.count({ where: { rateId: id } });
  if (used > 0) return { ok: false, error: `이 기준으로 만든 지급 내역이 ${used}건 있어 삭제할 수 없습니다.` };
  if ((await prisma.allowanceRate.count()) <= 1) return { ok: false, error: "수당 기준은 최소 1개가 있어야 합니다." };
  const r = await prisma.allowanceRate.delete({ where: { id } });
  await logEvent(prisma, "AllowanceRate", id, `수당 기준(${r.effectiveFrom}~)`, "DELETE");
  return done();
}

export async function setProRata(value: boolean): Promise<ActionResult> {
  const before = await getProRata();
  await prisma.appSetting.upsert({
    where: { key: "allowance.proRata" },
    create: { key: "allowance.proRata", value: String(value) },
    update: { value: String(value) },
  });
  if (before !== value) {
    await prisma.changeLog.create({
      data: {
        entity: "AppSetting",
        entityId: 0,
        label: "정액급여 일할계산",
        action: "UPDATE",
        field: "일할계산",
        before: before ? "예" : "아니오",
        after: value ? "예" : "아니오",
      },
    });
  }
  return done();
}
