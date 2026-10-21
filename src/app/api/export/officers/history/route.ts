import type { NextRequest } from "next/server";

import { today } from "@/lib/date";
import { buildWorkbook, excelResponse, makeFilename } from "@/lib/excel";
import { historySheet } from "@/lib/exports/officers";
import { parseHistoryFilter } from "@/lib/queries/officers";

export async function GET(req: NextRequest) {
  const filter = parseHistoryFilter(Object.fromEntries(req.nextUrl.searchParams));
  const { sheet, conditionLabel } = await historySheet(filter, today());
  return excelResponse(buildWorkbook([sheet]), makeFilename("역대임원", conditionLabel));
}
