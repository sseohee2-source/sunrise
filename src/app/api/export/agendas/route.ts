import type { NextRequest } from "next/server";

import { buildWorkbook, excelResponse, makeFilename } from "@/lib/excel";
import { agendasSheet } from "@/lib/exports/meetings";
import { prisma } from "@/lib/db";
import { parseAgendaFilter } from "@/lib/queries/agendas";

export async function GET(req: NextRequest) {
  const f = parseAgendaFilter(Object.fromEntries(req.nextUrl.searchParams));
  const sheet = await agendasSheet(f);
  let cond = f.period.fileLabel;
  if (f.meetingId) {
    const m = await prisma.meeting.findUnique({ where: { id: f.meetingId } });
    cond = m ? `${m.year}-제${m.sessionNo}회` : "회차";
  }
  return excelResponse(buildWorkbook([sheet]), makeFilename("이사회안건", cond, f.q ? `검색-${f.q}` : null));
}
