// 임원명단 Word(.docx) 출력: A4 세로, 표 테두리, "임원 현황(YYYY.MM.DD 기준)" 제목
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

import { fmtDate } from "@/lib/date";
import { termText } from "@/lib/exports/officers";
import { printRows, type RosterEntry } from "@/lib/queries/officers";

const FONT = "맑은 고딕";
const SIZE = 18; // 9pt (half-points)
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

// A4 폭 21cm − 좌우 여백 각 1.5cm = 18cm ≈ 10206 twip
const COL_WIDTHS = [1700, 1000, 1900, 2600, 3006];
const HEADERS = ["직책", "성명", "임기", "학력", "주요경력"];

function cellParagraphs(text: string | null | undefined, opts: { bold?: boolean; center?: boolean } = {}) {
  const lines = (text ?? "").split("\n");
  return lines.map(
    (line) =>
      new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: 20, after: 20 },
        children: [new TextRun({ text: line, font: FONT, size: SIZE, bold: opts.bold })],
      }),
  );
}

function cell(
  text: string | null | undefined,
  width: number,
  opts: { bold?: boolean; center?: boolean; header?: boolean } = {},
) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    shading: opts.header ? { type: ShadingType.CLEAR, color: "auto", fill: "D9E1F2" } : undefined,
    children: cellParagraphs(text, opts),
  });
}

export async function buildRosterDocx(roster: RosterEntry[], on: string, includeVacancies: boolean): Promise<Buffer> {
  const header = new TableRow({
    tableHeader: true, // 다음 쪽에도 머리글 반복
    children: HEADERS.map((h, i) => cell(h, COL_WIDTHS[i], { bold: true, center: true, header: true })),
  });
  const body = printRows(roster, includeVacancies).map((r) =>
    r.section
      ? // 구분 줄: 표 폭 전체를 합친 한 칸
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              columnSpan: COL_WIDTHS.length,
              width: {
                size: COL_WIDTHS.reduce((a, b) => a + b, 0),
                type: WidthType.DXA,
              },
              borders: BORDERS,
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              shading: {
                type: ShadingType.CLEAR,
                color: "auto",
                fill: "EDEDED",
              },
              children: cellParagraphs(r.section, { bold: true }),
            }),
          ],
        })
      : new TableRow({
          cantSplit: true,
          children: [
            cell(r.positionName, COL_WIDTHS[0], { center: true }),
            cell(r.appt?.person.name ?? "결원", COL_WIDTHS[1], {
              center: true,
            }),
            cell(r.appt ? termText(r.appt) : "", COL_WIDTHS[2], {
              center: true,
            }),
            cell(r.appt?.person.education, COL_WIDTHS[3]),
            cell(r.appt?.person.career, COL_WIDTHS[4]),
          ],
        }),
  );

  const doc = new Document({
    creator: "이사회 실적관리 시스템",
    title: `임원 현황(${fmtDate(on)} 기준)`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
              orientation: PageOrientation.PORTRAIT,
            }, // A4 세로
            margin: { top: 1134, bottom: 1134, left: 850, right: 850 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `임원 현황(${fmtDate(on)} 기준)`,
                font: FONT,
                size: 32,
                bold: true,
              }),
            ],
          }),
          new Table({
            width: {
              size: COL_WIDTHS.reduce((a, b) => a + b, 0),
              type: WidthType.DXA,
            },
            columnWidths: COL_WIDTHS,
            layout: TableLayoutType.FIXED,
            rows: [header, ...body],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
