/**
 * 공통 엑셀 내보내기 모듈
 *
 * 모든 화면의 "엑셀 다운로드"와 통합 내보내기가 이 모듈을 사용한다.
 * - 첫 행 제목, 조건·안내 문구, 머리글(굵게·배경색·틀 고정·자동 필터), 표 테두리
 * - 날짜는 엑셀 날짜, 금액·정수는 숫자(천 단위 콤마), 비율은 백분율 형식
 * - 합계 행은 엑셀 수식으로 넣어 엑셀에서 값이 바뀌어도 다시 계산됨
 * - 여러 줄 텍스트는 줄바꿈 유지
 */
import ExcelJS from "exceljs";
import { toExcelDate, todayCompact } from "@/lib/date";

/** text 글자 · multiline 여러 줄 · date 날짜 · money 금액 · int 정수(콤마) · year 연도/번호(콤마 없음) · percent 백분율 · decimal 소수 */
export type ColumnType = "text" | "multiline" | "date" | "money" | "int" | "year" | "percent" | "decimal";

export type TotalContext = {
  /** 합계 행에서 다른 열의 셀 주소 (예: "D25") */
  cell: (key: string) => string;
  /** 다른 열의 데이터 범위 (예: "D4:D24") */
  range: (key: string) => string;
};

export type Column<T> = {
  header: string;
  /** 열 식별자 (합계 수식에서 참조할 때 사용) */
  key: string;
  /** 값 꺼내기. 없으면 row[key] */
  value?: (row: T) => unknown;
  type?: ColumnType;
  /** 고정 너비 (없으면 자동 조정) */
  width?: number;
  /**
   * 합계 행 내용
   * - "sum" / "average" / "count": 해당 열 집계
   * - 함수: 엑셀 수식 문자열을 반환 (예: 출석률 = 출석/재적)
   */
  total?: "sum" | "average" | "count" | ((ctx: TotalContext) => string);
};

export type SheetSpec<T = Record<string, unknown>> = {
  /** 시트 이름 (31자 이내로 자동 정리) */
  name: string;
  /** 첫 행 제목 */
  title: string;
  /** 제목 아래 안내 줄 (조회 조건, 참고 문구 등) */
  notes?: string[];
  columns: Column<T>[];
  rows: T[];
  /** 합계 행 표시 (columns 의 total 이 하나라도 있으면 기본 표시) */
  totalLabel?: string;
  /** 인쇄 방향 */
  landscape?: boolean;
  /** 구분 줄: 문자열을 돌려주면 그 행은 표 폭 전체를 합친 구분 줄로 표시 (예: 【상임이사】) */
  section?: (row: T) => string | null | undefined;
  /** 행 강조 (warning 노랑, danger 빨강) */
  highlight?: (row: T) => "warning" | "danger" | null | undefined;
};

export type SummarySpec = {
  title: string;
  /** [항목, 값] — 출력 조건 */
  conditions: [string, string][];
  notes?: string[];
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
const HIGHLIGHT_FILL: Record<"warning" | "danger", ExcelJS.Fill> = {
  warning: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } },
  danger: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4E4" } },
};
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const FONT = "맑은 고딕";

const NUM_FMT: Partial<Record<ColumnType, string>> = {
  date: "yyyy.mm.dd",
  money: "#,##0",
  int: "#,##0",
  year: "0",
  percent: "0.0%",
  decimal: "#,##0.0",
};

/** 엑셀 시트 이름 규칙에 맞게 정리 */
function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "Sheet";
  let n = 2;
  let candidate = base;
  while (used.has(candidate)) {
    const suffix = `(${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  base = candidate;
  used.add(base);
  return base;
}

/** 표시 너비 (한글 등 전각 문자는 2칸) */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return w;
}

function cellValue(type: ColumnType, v: unknown): ExcelJS.CellValue {
  if (v == null || v === "") return null;
  switch (type) {
    case "date":
      return typeof v === "string" ? toExcelDate(v) : (v as Date);
    case "money":
    case "int":
    case "year":
    case "percent":
    case "decimal": {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    }
    default:
      return String(v);
  }
}

function textForWidth(type: ColumnType, v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (type === "date") return "0000.00.00";
  if (type === "percent") return "100.0%";
  if (typeof v === "number") return v.toLocaleString("ko-KR");
  return String(v);
}

function addSheet<T>(wb: ExcelJS.Workbook, spec: SheetSpec<T>, used: Set<string>) {
  const ws = wb.addWorksheet(safeSheetName(spec.name, used), {
    pageSetup: {
      paperSize: 9, // A4
      orientation: spec.landscape ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });
  const cols = spec.columns;
  const nCols = Math.max(cols.length, 1);

  // 1행: 제목
  ws.mergeCells(1, 1, 1, nCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = spec.title;
  titleCell.font = { name: FONT, size: 14, bold: true };
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 24;

  // 안내 줄
  let r = 2;
  for (const note of spec.notes ?? []) {
    ws.mergeCells(r, 1, r, nCols);
    const c = ws.getCell(r, 1);
    c.value = note;
    c.font = { name: FONT, size: 9, color: { argb: "FF555555" } };
    r++;
  }
  r++; // 빈 줄

  // 머리글
  const headerRow = r;
  const widths = cols.map((c) => displayWidth(c.header) + 2);
  cols.forEach((c, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, bold: true };
    cell.fill = HEADER_FILL;
    cell.border = THIN;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  // 데이터
  const firstData = headerRow + 1;
  spec.rows.forEach((row, ri) => {
    const rowNo = firstData + ri;
    const sectionLabel = spec.section?.(row);
    if (sectionLabel) {
      ws.mergeCells(rowNo, 1, rowNo, nCols);
      const cell = ws.getCell(rowNo, 1);
      cell.value = sectionLabel;
      cell.font = { name: FONT, bold: true };
      cell.fill = SECTION_FILL;
      cell.alignment = { vertical: "middle" };
      for (let c = 1; c <= nCols; c++) ws.getCell(rowNo, c).border = THIN;
      return;
    }
    let maxLines = 1;
    const hl = spec.highlight?.(row);
    cols.forEach((c, ci) => {
      const type = c.type ?? "text";
      const raw = c.value ? c.value(row) : (row as Record<string, unknown>)[c.key];
      const v = cellValue(type, raw);
      const cell = ws.getCell(rowNo, ci + 1);
      cell.value = v;
      cell.font = { name: FONT };
      cell.border = THIN;
      if (hl) cell.fill = HIGHLIGHT_FILL[hl];
      if (NUM_FMT[type]) cell.numFmt = NUM_FMT[type]!;
      if (type === "multiline") {
        cell.alignment = { wrapText: true, vertical: "top" };
        const lines = String(v ?? "").split("\n");
        maxLines = Math.max(maxLines, lines.length);
        for (const line of lines) widths[ci] = Math.max(widths[ci], displayWidth(line) + 2);
      } else {
        cell.alignment = {
          vertical: "top",
          horizontal: type === "date" ? "center" : undefined,
        };
        widths[ci] = Math.max(widths[ci], displayWidth(textForWidth(type, v)) + 2);
      }
    });
    if (maxLines > 1) ws.getRow(rowNo).height = Math.min(15 * maxLines, 400);
  });
  const lastData = firstData + spec.rows.length - 1;

  // 합계 행
  const hasTotal = cols.some((c) => c.total);
  if (hasTotal && spec.rows.length > 0) {
    const totalRow = lastData + 1;
    const colLetter = (key: string) => {
      const idx = cols.findIndex((c) => c.key === key);
      if (idx < 0) throw new Error(`엑셀 합계 수식: 열 '${key}' 없음`);
      return ws.getColumn(idx + 1).letter;
    };
    const ctx: TotalContext = {
      cell: (key) => `${colLetter(key)}${totalRow}`,
      range: (key) => `${colLetter(key)}${firstData}:${colLetter(key)}${lastData}`,
    };
    cols.forEach((c, ci) => {
      const cell = ws.getCell(totalRow, ci + 1);
      const letter = ws.getColumn(ci + 1).letter;
      const range = `${letter}${firstData}:${letter}${lastData}`;
      const type = c.type ?? "text";
      if (c.total === "sum") cell.value = { formula: `SUM(${range})` };
      else if (c.total === "average") cell.value = { formula: `IFERROR(AVERAGE(${range}),0)` };
      else if (c.total === "count") cell.value = { formula: `COUNTA(${range})` };
      else if (typeof c.total === "function") cell.value = { formula: c.total(ctx) };
      if (NUM_FMT[type]) cell.numFmt = NUM_FMT[type]!;
      if (c.total === "count") cell.numFmt = "#,##0";
      cell.font = { name: FONT, bold: true };
      cell.fill = TOTAL_FILL;
      cell.border = THIN;
    });
    // 첫 번째 '합계 없는' 열에 라벨
    const labelIdx = cols.findIndex((c) => !c.total);
    if (labelIdx >= 0) {
      const cell = ws.getCell(totalRow, labelIdx + 1);
      cell.value = spec.totalLabel ?? "합계";
      cell.alignment = { horizontal: "center" };
    }
  }

  // 열 너비
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? Math.min(Math.max(widths[i], 6), 60);
  });

  // 틀 고정 + 자동 필터
  ws.views = [{ state: "frozen", ySplit: headerRow, xSplit: 0 }];
  if (cols.length > 0) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: Math.max(lastData, headerRow), column: cols.length },
    };
  }
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  return ws;
}

function addSummarySheet(
  wb: ExcelJS.Workbook,
  summary: SummarySpec,
  sheets: { name: string; rows: unknown[] }[],
  used: Set<string>,
) {
  const ws = wb.addWorksheet(safeSheetName("요약", used));
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 60;
  ws.mergeCells(1, 1, 1, 2);
  ws.getCell(1, 1).value = summary.title;
  ws.getCell(1, 1).font = { name: FONT, size: 14, bold: true };

  const put = (row: number, k: string, v: string | number, head = false) => {
    const a = ws.getCell(row, 1);
    const b = ws.getCell(row, 2);
    a.value = k;
    b.value = v;
    for (const c of [a, b]) {
      c.border = THIN;
      c.font = { name: FONT, bold: head };
      c.alignment = { vertical: "top", wrapText: true };
    }
    a.fill = HEADER_FILL;
    a.font = { name: FONT, bold: true };
  };

  let r = 3;
  const now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  put(r++, "출력일시", now.replaceAll("-", "."));
  for (const [k, v] of summary.conditions) put(r++, k, v);
  r++;
  put(r++, "시트", "건수", true);
  for (const s of sheets) put(r++, s.name, `${s.rows.length.toLocaleString("ko-KR")}건`);
  r++;
  for (const note of summary.notes ?? []) {
    ws.mergeCells(r, 1, r, 2);
    ws.getCell(r, 1).value = note;
    ws.getCell(r, 1).font = { name: FONT, size: 9, color: { argb: "FF555555" } };
    r++;
  }
}

/**
 * 워크북 생성
 * @param sheets 시트 목록 (항목별 1개)
 * @param summary 지정 시 맨 앞에 "요약" 시트(출력 조건, 출력일시, 시트별 건수) 추가
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 시트마다 행 타입이 다름
export function buildWorkbook(sheets: SheetSpec<any>[], summary?: SummarySpec): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "이사회 실적관리 시스템";
  wb.created = new Date();
  // 파일을 열 때 합계 수식을 다시 계산
  wb.calcProperties = { fullCalcOnLoad: true };
  const used = new Set<string>();
  if (summary) addSummarySheet(wb, summary, sheets, used);
  for (const s of sheets) addSheet(wb, s as SheetSpec<unknown>, used);
  return wb;
}

/**
 * 파일명: 항목명_조건_YYYYMMDD.xlsx
 * (예: makeFilename("이사회안건", "2026") → 이사회안건_2026_20261021.xlsx)
 */
export function makeFilename(item: string, ...conditions: (string | null | undefined)[]): string {
  const parts = [item, ...conditions.filter((c): c is string => !!c)].map((p) => p.replace(/[\\/:*?"<>|\s]+/g, "-"));
  return `${parts.join("_")}_${todayCompact()}.xlsx`;
}

/** 다운로드 응답 (한글 파일명 지원) */
export async function excelResponse(wb: ExcelJS.Workbook, filename: string): Promise<Response> {
  const buf = await wb.xlsx.writeBuffer();
  return fileResponse(
    buf as ArrayBuffer,
    filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

/** 파일 다운로드 응답 (엑셀·워드 공통) */
export function fileResponse(buf: ArrayBuffer | Uint8Array, filename: string, contentType: string): Response {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  return new Response(buf as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
