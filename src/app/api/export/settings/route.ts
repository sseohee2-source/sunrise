import { POSITION_CATEGORY, label } from "@/lib/codes";
import { buildWorkbook, excelResponse, makeFilename, type SheetSpec } from "@/lib/excel";
import { getSettingsData } from "@/lib/queries/settings";

const OX = (b: boolean) => (b ? "O" : "X");

export async function GET() {
  const d = await getSettingsData();
  type Named = { name: string; isActive: boolean; isHeadOffice?: boolean };
  const simple = (name: string, title: string, rows: Named[], headOffice = false): SheetSpec<Named> => ({
    name,
    title,
    columns: [
      { header: "순서", key: "no", type: "int", value: (r) => rows.indexOf(r) + 1 },
      { header: "이름", key: "name" },
      ...(headOffice ? [{ header: "본사 지역", key: "ho", value: (r: Named) => OX(!!r.isHeadOffice) }] : []),
      { header: "사용", key: "active", value: (r) => OX(r.isActive) },
    ],
    rows,
  });
  const sheets = [
    {
      name: "직책마스터",
      title: "직책 마스터",
      columns: [
        { header: "순서", key: "no", type: "int", value: (r: (typeof d.positions)[number]) => d.positions.indexOf(r) + 1 },
        { header: "구분", key: "category", value: (r: (typeof d.positions)[number]) => label(POSITION_CATEGORY, r.category) },
        { header: "직책", key: "name" },
        { header: "정원", key: "quota", type: "int", total: "sum" },
        { header: "재적이사 포함", key: "m", value: (r: (typeof d.positions)[number]) => OX(r.countsAsMember) },
        { header: "수당 지급 대상", key: "a", value: (r: (typeof d.positions)[number]) => OX(r.allowanceEligible) },
        { header: "사용", key: "act", value: (r: (typeof d.positions)[number]) => OX(r.isActive) },
        { header: "비고", key: "note" },
      ],
      rows: d.positions,
    } satisfies SheetSpec<(typeof d.positions)[number]>,
    {
      name: "수당기준",
      title: "비상임이사 수당 기준",
      notes: [`정액급여 일할계산: ${d.proRata ? "예" : "아니오"}`],
      columns: [
        { header: "적용 시작일", key: "effectiveFrom", type: "date" },
        { header: "정액급여(월)", key: "monthlyFixed", type: "money" },
        { header: "대면 회의수당", key: "faceFee", type: "money" },
        { header: "서면 회의수당", key: "writtenFee", type: "money" },
        { header: "연간 한도", key: "annualLimit", type: "money" },
        { header: "한도 경고 여유분", key: "warningMargin", type: "money" },
        { header: "비고", key: "note" },
      ],
      rows: d.rates,
    } satisfies SheetSpec<(typeof d.rates)[number]>,
    simple("소위원회", "소위원회 종류", d.committees),
    simple("부서", "부서 목록", d.departments),
    simple("개최지역", "개최 지역", d.regions, true),
  ];
  return excelResponse(buildWorkbook(sheets), makeFilename("설정", "전체"));
}
