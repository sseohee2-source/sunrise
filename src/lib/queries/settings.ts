import { prisma } from "@/lib/db";

/** 정액급여 일할계산 여부 (기본: 예) */
export async function getProRata(): Promise<boolean> {
  const s = await prisma.appSetting.findUnique({ where: { key: "allowance.proRata" } });
  return s ? s.value === "true" : true;
}

export async function getSettingsData() {
  const [positions, rates, departments, regions, committees, proRata] = await Promise.all([
    prisma.position.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { _count: { select: { appointments: true } } } }),
    prisma.allowanceRate.findMany({ orderBy: { effectiveFrom: "desc" }, include: { _count: { select: { payments: true } } } }),
    prisma.department.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.region.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.committee.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    getProRata(),
  ]);
  return { positions, rates, departments, regions, committees, proRata };
}
