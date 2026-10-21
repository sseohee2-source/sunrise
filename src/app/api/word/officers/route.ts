import type { NextRequest } from "next/server";

import { isDate } from "@/lib/action-result";
import { today } from "@/lib/date";
import { fileResponse } from "@/lib/excel";
import { getRoster } from "@/lib/queries/officers";
import { buildRosterDocx } from "@/lib/word/officers";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const d = sp.get("date");
  const on = isDate(d) ? d : today();
  const buf = await buildRosterDocx(await getRoster(on), on, sp.get("vacancy") !== "0");
  return fileResponse(
    new Uint8Array(buf),
    `임원명단_${on.replaceAll("-", "")}기준_${today().replaceAll("-", "")}.docx`,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}
