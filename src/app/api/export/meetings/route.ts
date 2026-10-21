import type { NextRequest } from "next/server";

import { sp } from "@/lib/action-result";
import { buildWorkbook, excelResponse, makeFilename } from "@/lib/excel";
import { meetingsSheet } from "@/lib/exports/meetings";
import { parsePeriod } from "@/lib/period";

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const period = parsePeriod(params);
  const sheet = await meetingsSheet({ period, method: sp(params, "method"), status: sp(params, "status") });
  return excelResponse(buildWorkbook([sheet]), makeFilename("이사회개최현황", period.fileLabel));
}
