import type { NextRequest } from "next/server";

import { isDate } from "@/lib/action-result";
import { today } from "@/lib/date";
import { buildWorkbook, excelResponse, makeFilename } from "@/lib/excel";
import { rosterSheet } from "@/lib/exports/officers";
import { getRoster } from "@/lib/queries/officers";

export async function GET(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("date");
  const on = isDate(d) ? d : today();
  const wb = buildWorkbook([rosterSheet(await getRoster(on), on)]);
  return excelResponse(wb, makeFilename("임원현황", `${on.replaceAll("-", "")}기준`));
}
