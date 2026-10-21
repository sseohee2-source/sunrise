import { FileText } from "lucide-react";
import { Suspense } from "react";

import { DatePickerForm } from "@/components/common/date-picker-form";
import { ExcelDownloadButton } from "@/components/common/excel-download-button";
import { Multiline } from "@/components/common/multiline";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isDate } from "@/lib/action-result";
import { fmtDate, today } from "@/lib/date";
import { termText } from "@/lib/exports/officers";
import { getRoster, printRows } from "@/lib/queries/officers";
import { VacancyToggle } from "./vacancy-toggle";

export default async function OfficerPrintPage({ searchParams }: PageProps<"/officers/print">) {
  const sp = await searchParams;
  const on = isDate(sp.date) ? sp.date : today();
  const includeVacancies = sp.vacancy !== "0";
  const rows = printRows(await getRoster(on), includeVacancies);
  const q = new URLSearchParams({
    date: on,
    ...(includeVacancies ? {} : { vacancy: "0" }),
  });

  return (
    <>
      <PageHeader
        title="임원명단 출력"
        description="기준일의 임원 현황을 Word(.docx)와 엑셀로 출력합니다. 아래는 출력물 미리보기입니다."
        actions={
          <>
            <Suspense>
              <DatePickerForm value={on} />
              <VacancyToggle checked={includeVacancies} />
            </Suspense>
            <Button asChild variant="outline" className="border-blue-600/40 text-blue-700 hover:bg-blue-50">
              <a href={`/api/word/officers?${q}`} download>
                <FileText />
                Word 다운로드
              </a>
            </Button>
            <ExcelDownloadButton endpoint="/api/export/officers/print" params={{ date: on }} />
          </>
        }
      />
      <Card className="mx-auto max-w-[210mm] rounded-none px-[12mm] py-[14mm] shadow-md">
        <CardContent className="px-0">
          <h2 className="mb-5 text-center text-xl font-bold">임원 현황({fmtDate(on)} 기준)</h2>
          <table className="w-full border-collapse text-[12px] [&_td]:border [&_td]:border-black [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:border-black [&_th]:bg-[#D9E1F2] [&_th]:px-1.5 [&_th]:py-1.5">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[18%]" />
              <col className="w-[26%]" />
              <col className="w-[30%]" />
            </colgroup>
            <thead>
              <tr>
                <th>직책</th>
                <th>성명</th>
                <th>임기</th>
                <th>학력</th>
                <th>주요경력</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) =>
                r.section ? (
                  <tr key={i}>
                    <td colSpan={5} className="bg-[#EDEDED] font-bold">
                      {r.section}
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td className="text-center">{r.positionName}</td>
                    <td className="text-center">{r.appt?.person.name ?? "결원"}</td>
                    <td className="text-center whitespace-pre-line">{r.appt ? termText(r.appt) : ""}</td>
                    <td>
                      <Multiline text={r.appt?.person.education} />
                    </td>
                    <td>
                      <Multiline text={r.appt?.person.career} />
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
