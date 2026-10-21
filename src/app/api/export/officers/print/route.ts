import type { NextRequest } from "next/server";

import { isDate } from "@/lib/action-result";
import { today } from "@/lib/date";
import { buildWorkbook, excelResponse, makeFilename } from "@/lib/excel";
import { rosterPrintSheet } from "@/lib/exports/officers";
import { getRoster } from "@/lib/queries/officers";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const d = sp.get("date");
  const on = isDate(d) ? d : today();
  const sheet = rosterPrintSheet(await getRoster(on), on, sp.get("vacancy") !== "0");
  return excelResponse(buildWorkbook([sheet]), makeFilename("임원명단", `${on.replaceAll("-", "")}기준`));
}
