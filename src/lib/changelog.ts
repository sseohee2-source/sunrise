import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * 수정 전/후를 비교해 바뀐 필드만 변경이력에 기록
 * @param fields 기록할 필드와 한글 이름 (예: { amount: "금액", status: "지급상태" })
 * @param format 값 표시 변환 (코드값 → 한글 등)
 */
export async function logUpdate<T extends Record<string, unknown>>(
  db: Db,
  entity: string,
  entityId: number,
  label: string,
  before: T,
  after: Partial<T>,
  fields: Partial<Record<keyof T & string, string>>,
  format?: Partial<Record<keyof T & string, (v: unknown) => string>>,
): Promise<number> {
  const rows: Prisma.ChangeLogCreateManyInput[] = [];
  for (const [key, name] of Object.entries(fields) as [keyof T & string, string][]) {
    if (!(key in after)) continue;
    const b = str(before[key]);
    const a = str(after[key]);
    if (b === a) continue;
    const f = format?.[key];
    rows.push({
      entity,
      entityId,
      label,
      action: "UPDATE",
      field: name,
      before: f && b != null ? f(before[key]) : b,
      after: f && a != null ? f(after[key]) : a,
    });
  }
  if (rows.length) await db.changeLog.createMany({ data: rows });
  return rows.length;
}

/** 생성·삭제 기록 (summary 에 주요 값 요약) */
export async function logEvent(
  db: Db,
  entity: string,
  entityId: number,
  label: string,
  action: "CREATE" | "DELETE",
  summary?: string,
) {
  await db.changeLog.create({
    data: {
      entity,
      entityId,
      label,
      action,
      before: action === "DELETE" ? (summary ?? null) : null,
      after: action === "CREATE" ? (summary ?? null) : null,
    },
  });
}
