"""시설대여 견적서 PDF 생성 (reportlab)."""
from __future__ import annotations

import os
import re
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)

from .model import Quote, QuoteResult, RateBook, calculate, fmt_biz_no, fmt_phone
from .rates import is_family, resource_path

FONT = "NanumGothic"
FONT_B = "NanumGothic-Bold"

NAVY = colors.HexColor("#1F3864")
LINE = colors.HexColor("#9AA5B8")
LIGHT = colors.HexColor("#F3F6FB")
SUB = colors.HexColor("#E3EAF5")
LABEL = colors.HexColor("#EEF1F6")
ACCENT = colors.HexColor("#C00000")
GREY = colors.HexColor("#555555")

PAGE_W, PAGE_H = A4
MARGIN = 14 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

WEEKDAYS = "월화수목금토일"

_fonts_ready = False


def _register_fonts():
    global _fonts_ready
    if _fonts_ready:
        return
    pdfmetrics.registerFont(TTFont(FONT, resource_path("assets", "NanumGothic.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_B, resource_path("assets", "NanumGothicBold.ttf")))
    pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=FONT_B, italic=FONT, boldItalic=FONT_B)
    _fonts_ready = True


# ---------------------------------------------------------------- 서식 도우미
def fmt_won(v: int) -> str:
    return f"{v:,}" if v else "-"


def fmt_date(d: date | None, short=False) -> str:
    if not d:
        return "-"
    s = d.strftime("%y.%m.%d" if short else "%Y.%m.%d")
    return f"{s}({WEEKDAYS[d.weekday()]})"


def fmt_rate(r: float) -> str:
    return f"{r * 100:g}%"


def korean_amount(n: int) -> str:
    """금액을 한글로 (예: 1617000 → 일백육십일만칠천)."""
    if n == 0:
        return "영"
    digits = "영일이삼사오육칠팔구"
    small = ["", "십", "백", "천"]
    big = ["", "만", "억", "조"]
    out = []
    for bi in range(len(big)):
        chunk = n % 10000
        n //= 10000
        if chunk:
            s = ""
            for si in range(4):
                d = chunk % 10
                chunk //= 10
                if d:
                    s = digits[d] + small[si] + s
            out.insert(0, s + big[bi])
        if n == 0:
            break
    return "".join(out)


def quote_no(q: Quote) -> str:
    return f"{q.quote_date:%Y%m%d}-{q.revision or '01'}"


class _Styles:
    def __init__(self):
        P = ParagraphStyle
        self.title = P("title", fontName=FONT_B, fontSize=22, leading=28, alignment=TA_CENTER, textColor=NAVY)
        self.subtitle = P("subtitle", fontName=FONT, fontSize=9.5, leading=13, alignment=TA_CENTER,
                          textColor=GREY)
        self.h = P("h", fontName=FONT_B, fontSize=11, leading=15, textColor=NAVY, spaceBefore=1, spaceAfter=2.5)
        self.cell = P("cell", fontName=FONT, fontSize=8.6, leading=11.5, alignment=TA_CENTER)
        self.cell_l = P("cell_l", parent=self.cell, alignment=TA_LEFT)
        self.cell_r = P("cell_r", parent=self.cell, alignment=TA_RIGHT)
        self.small = P("small", fontName=FONT, fontSize=8, leading=11.5, textColor=GREY)
        self.note = P("note", fontName=FONT, fontSize=8.3, leading=12.5)
        self.footer = P("footer", fontName=FONT_B, fontSize=8.8, leading=12, textColor=NAVY)
        self.company = P("company", fontName=FONT_B, fontSize=13, leading=17)


# ---------------------------------------------------------------- 표 공통 스타일
def _grid_style(n_rows, header=True, total_rows=(), align_right_from=None):
    st = [
        ("FONT", (0, 0), (-1, -1), FONT, 8.6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LINEABOVE", (0, 0), (-1, 0), 1.2, NAVY),
        ("LINEBELOW", (0, -1), (-1, -1), 1.2, NAVY),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        st += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
               ("FONT", (0, 0), (-1, 0), FONT_B, 8.6)]
    first = 1 if header else 0
    for r in range(first, n_rows):
        if (r - first) % 2 == 1 and r not in total_rows:
            st.append(("BACKGROUND", (0, r), (-1, r), LIGHT))
    for r in total_rows:
        st += [("BACKGROUND", (0, r), (-1, r), SUB), ("FONT", (0, r), (-1, r), FONT_B, 8.6),
               ("LINEABOVE", (0, r), (-1, r), 0.8, NAVY)]
    if align_right_from is not None:
        st.append(("ALIGN", (align_right_from, first), (-1, -1), "RIGHT"))
    return TableStyle(st)


def _keep_spaces(text: str) -> str:
    """연속된 공백을 PDF에서도 그대로 보이게 (Paragraph 는 공백을 하나로 줄임)."""
    return re.sub(r" {2,}", lambda m: "&nbsp;" * len(m.group(0)), text)


# ---------------------------------------------------------------- 제목 + 최종/가견적 배지
def status_text(q: Quote) -> str:
    return "최 종" if q.final else "가견적"


def _title_row(text: str, q: Quote, S: _Styles):
    color = ACCENT if q.final else GREY
    badge = Table([[status_text(q)]], colWidths=[20 * mm], rowHeights=[9 * mm])
    badge.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), FONT_B, 11), ("TEXTCOLOR", (0, 0), (-1, -1), color),
                               ("BOX", (0, 0), (-1, -1), 1.6, color), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                               ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    t = Table([["", Paragraph(text, S.title), badge]], colWidths=[24 * mm, CONTENT_W - 48 * mm, 24 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return t


# ---------------------------------------------------------------- 1쪽 : 견적서
def _party_boxes(q: Quote, book: RateBook, S: _Styles):
    sup = book.supplier
    lw = CONTENT_W * 0.47
    rw = CONTENT_W - lw - 4 * mm
    v = lambda x: x or "-"  # noqa: E731

    left = [
        ["수 신", Paragraph(f"{q.company or '-'} <font size=9>귀하</font>", S.company)],
        ["사업자번호", v(fmt_biz_no(q.biz_no))],
        ["대표자", v(q.ceo)],
        ["담당자", v(q.contact)],
        ["사무실", v(fmt_phone(q.office))],
        ["핸드폰", v(fmt_phone(q.mobile))],
        ["이메일", v(q.email)],
    ]
    lt = Table(left, colWidths=[22 * mm, lw - 22 * mm], rowHeights=[24] + [17] * 6)
    lt.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), FONT, 8.6),
        ("FONT", (0, 0), (0, -1), FONT_B, 8.6),
        ("BACKGROUND", (0, 0), (0, -1), LABEL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("BOX", (0, 0), (-1, -1), 1.0, NAVY),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
    ]))

    stamp_path = book_stamp_path()
    inner_w = rw - 22 * mm - 12
    name_cell = Table([[Paragraph(f"<b>{sup.name}</b>", ParagraphStyle("nm", parent=S.cell_l, fontSize=9.5,
                                                                          leading=12)), "(인)"]],
                      colWidths=[inner_w - 16 * mm, 16 * mm])
    name_cell.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), FONT, 9), ("ALIGN", (1, 0), (1, 0), "CENTER"),
                                   ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                   ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    right = [
        ["공 급 자", name_cell],
        ["사업자번호", sup.biz_no],
        ["대    표", sup.ceo],
        ["업태 / 종목", Paragraph(f"{sup.biz_type} / {sup.biz_item}", S.cell_l)],
        ["주    소", Paragraph(sup.address, S.cell_l)],
        ["담 당 자", Paragraph(" &nbsp;".join(x for x in (sup.manager, f"({sup.manager_email})" if sup.manager_email
                                                         else "") if x) or "-", S.cell_l)],
        ["연 락 처", "   ".join(x for x in (f"☎ {sup.office_tel}" if sup.office_tel else "",
                                          f"FAX {sup.fax}" if sup.fax else "") if x) or "-"],
    ]
    rt = Table(right, colWidths=[22 * mm, rw - 22 * mm], rowHeights=[24] + [17] * 6)
    rt.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), FONT, 8.6),
        ("FONT", (0, 0), (0, -1), FONT_B, 8.6),
        ("BACKGROUND", (0, 0), (0, -1), LABEL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("BOX", (0, 0), (-1, -1), 1.0, NAVY),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
    ]))
    outer = Table([[lt, "", rt]], colWidths=[lw, 4 * mm, rw])
    outer.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                               ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                               ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    # 직인 위치 (공급자 상호 오른쪽 '(인)' 위) : 페이지 좌표로 기록해 두었다가 onPage 에서 찍는다
    # '(인)' 칸 중앙에 직인을 겹쳐 찍는다 (셀 좌우 패딩 6pt)
    in_x = lw + 4 * mm + rw - 6 - 8 * mm
    outer._stamp = (stamp_path, in_x, 13)
    return outer


def stamp_file() -> str:
    """담당자가 [담당자·안내문 설정]에서 등록한 직인 이미지 위치 (exe 와 같은 폴더)."""
    from .rates import app_dir
    return os.path.join(app_dir(), "직인.png")


def book_stamp_path() -> str:
    """등록된 직인이 있으면 그 경로, 없으면 빈 문자열 (프로그램·저장소에는 직인을 두지 않음)."""
    path = stamp_file()
    return path if os.path.exists(path) else ""


class _StampedTable(Table):
    """오른쪽 위에 직인 이미지를 겹쳐 그리는 표."""

    def __init__(self, inner: Table, stamp: str, size: float, center_x: float, center_from_top: float):
        super().__init__([[inner]], colWidths=[CONTENT_W])
        self.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                  ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        self._stamp_img, self._stamp_size = stamp, size
        self._cx, self._cy_top = center_x, center_from_top

    def draw(self):
        super().draw()
        if self._stamp_img and os.path.exists(self._stamp_img):
            s = self._stamp_size
            x = self._cx - s / 2
            y = self._height - self._cy_top - s / 2
            self.canv.drawImage(self._stamp_img, x, y, s, s, mask="auto", preserveAspectRatio=True)


def _summary_table(title_col, groups, total, qty_label, rooms_label, empty_text, S):
    rows = [[title_col, rooms_label, qty_label, "사용료", "부가세", "합계"]]
    used = [g for g in groups if g.total or g.rooms]
    for g in used:
        rows.append([g.name, f"{g.rooms:,}", f"{g.qty:,}", fmt_won(g.fee), fmt_won(g.vat), fmt_won(g.total)])
    if not used:
        rows.append([empty_text, "", "", "", "", ""])
    rows.append([total.name, f"{total.rooms:,}" if total.rooms else "-", f"{total.qty:,}" if total.qty else "-",
                 fmt_won(total.fee), fmt_won(total.vat), fmt_won(total.total)])
    w = CONTENT_W
    t = Table(rows, colWidths=[w * 0.30, w * 0.10, w * 0.11, w * 0.16, w * 0.15, w * 0.18])
    st = _grid_style(len(rows), total_rows=(len(rows) - 1,), align_right_from=3)
    if not used:
        st.add("SPAN", (0, 1), (-1, 1))
        st.add("TEXTCOLOR", (0, 1), (-1, 1), GREY)
        st.add("ALIGN", (0, 1), (-1, 1), "CENTER")
    t.setStyle(st)
    return t


def _page_one(q: Quote, book: RateBook, res: QuoteResult, S: _Styles):
    sup = book.supplier
    story = []
    story.append(_title_row("시 설 대 여 견 적 서", q, S))
    story.append(Paragraph(sup.title, S.subtitle))
    story.append(Spacer(1, 3 * mm))

    meta = Table([[f"견적번호  {quote_no(q)}", f"견적일자  {fmt_date(q.quote_date)}",
                   f"견적차수  {q.revision or '01'}"]],
                 colWidths=[CONTENT_W / 3] * 3)
    meta.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), FONT, 8.6), ("TEXTCOLOR", (0, 0), (-1, -1), GREY),
                              ("ALIGN", (0, 0), (0, 0), "LEFT"), ("ALIGN", (1, 0), (1, 0), "CENTER"),
                              ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(meta)
    story.append(Spacer(1, 1.5 * mm))

    boxes = _party_boxes(q, book, S)
    stamp, cx, cy = boxes._stamp
    story.append(_StampedTable(boxes, stamp, 14 * mm, cx, cy))
    story.append(Spacer(1, 2.2 * mm))

    days = (q.end_date - q.start_date).days + 1 if q.start_date and q.end_date else 0
    period = (f"{fmt_date(q.start_date)} ~ {fmt_date(q.end_date)}  ({days}일)" if days > 0 else "-")
    info = Table([["대관기간", period, "구내식당 이용", q.cafeteria or "-"]],
                 colWidths=[22 * mm, CONTENT_W - 22 * mm - 50 * mm, 30 * mm, 20 * mm])
    info.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), FONT, 9), ("FONT", (0, 0), (0, 0), FONT_B, 9),
        ("FONT", (2, 0), (2, 0), FONT_B, 9), ("BACKGROUND", (0, 0), (0, 0), LABEL),
        ("BACKGROUND", (2, 0), (2, 0), LABEL), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ALIGN", (1, 0), (1, 0), "LEFT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.8, NAVY), ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(info)
    story.append(Spacer(1, 2.2 * mm))

    total_label = "최종 견적금액" if q.final else "총 견적액"
    total = Table([[Paragraph(f"<b>{total_label}</b><br/><font size=8 color='#DDE3EE'>(부가세 포함)</font>",
                              ParagraphStyle("t", fontName=FONT, fontSize=12, leading=15, alignment=TA_CENTER,
                                             textColor=colors.white)),
                    Paragraph(f"일금 {korean_amount(res.grand_total)}원정", ParagraphStyle(
                        "k", fontName=FONT_B, fontSize=12.5, leading=16, alignment=TA_CENTER)),
                    Paragraph(f"₩ {res.grand_total:,}", ParagraphStyle(
                        "n", fontName=FONT_B, fontSize=17, leading=21, alignment=TA_RIGHT, textColor=ACCENT))]],
                  colWidths=[30 * mm, CONTENT_W - 30 * mm - 52 * mm, 52 * mm], rowHeights=[34])
    total.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), NAVY), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("BOX", (0, 0), (-1, -1), 1.5, NAVY), ("RIGHTPADDING", (2, 0), (2, 0), 8),
                               ("BACKGROUND", (1, 0), (-1, 0), LIGHT)]))
    story.append(Paragraph("아래와 같이 견적합니다.", S.small))
    story.append(Spacer(1, 1.5 * mm))
    story.append(total)
    story.append(Spacer(1, 3 * mm))

    story.append(Paragraph("1. 시설 사용료", S.h))
    story.append(_summary_table("시설 구분", res.facility_groups, res.facility_sum, "이용시간", "호실 수",
                                "시설 이용 내역 없음", S))
    story.append(Spacer(1, 2.2 * mm))
    story.append(Paragraph("2. 기숙사 사용료", S.h))
    story.append(_summary_table("객실 구분", res.dorm_groups, res.dorm_sum, "숙박일수", "객실 수",
                                "기숙사 이용 내역 없음", S))
    story.append(Spacer(1, 2.2 * mm))

    # 3. 견적 금액
    disc = book.discount(q.discount)
    if res.discount and disc is not None:
        if is_family(disc):
            rates = sorted({ln.use.rate for ln in res.facility_lines + res.dorm_lines if ln.use.rate})
            rate_txt = "항목별 " + ", ".join(fmt_rate(r) for r in rates)
        else:
            rate_txt = fmt_rate(disc.rate or 0)
        disc_desc = Paragraph(f"{q.discount}<br/><font color='#555555'>할인률 {rate_txt} (세부내역 참조)</font>",
                              S.cell_l)
    elif disc is not None:
        disc_desc = Paragraph(q.discount, S.cell_l)
    else:
        disc_desc = Paragraph("해당없음", S.cell_l)
    rows = [
        ["구 분", "내 용", "금 액"],
        ["합계 (C = A + B)", "시설 사용료(A) + 기숙사 사용료(B)", fmt_won(res.subtotal)],
        ["할인액 (D)", disc_desc, f"- {res.discount:,}" if res.discount else "-"],
        [("최종 견적금액" if q.final else "총 견적액") + " (E = C - D)", "부가세 포함", f"{res.grand_total:,}"],
    ]
    t = Table(rows, colWidths=[CONTENT_W * 0.25, CONTENT_W * 0.52, CONTENT_W * 0.23])
    st = _grid_style(len(rows), total_rows=(3,))
    st.add("ALIGN", (1, 1), (1, -1), "LEFT")
    st.add("ALIGN", (2, 1), (2, -1), "RIGHT")
    st.add("TEXTCOLOR", (2, 2), (2, 2), ACCENT)
    st.add("FONT", (2, 3), (2, 3), FONT_B, 10.5)
    st.add("TEXTCOLOR", (2, 3), (2, 3), ACCENT)
    t.setStyle(st)
    story.append(KeepTogether([Paragraph("3. 견적 금액", S.h), t]))
    story.append(Spacer(1, 2.2 * mm))

    # 4. 구내식당
    rows = [["시설명", "이용여부", "안내"],
            ["교류동", q.cafeteria or "-",
             Paragraph(_keep_spaces(sup.cafeteria_note.strip()).replace("\n", "<br/>"), S.cell_l)]]
    t = Table(rows, colWidths=[CONTENT_W * 0.20, CONTENT_W * 0.12, CONTENT_W * 0.68])
    t.setStyle(_grid_style(len(rows)))
    story.append(KeepTogether([Paragraph("4. 구내식당", S.h), t]))
    story.append(Spacer(1, 2.2 * mm))

    if sup.notice.strip():
        box = Table([[Paragraph("<b>유의사항</b><br/>" + sup.notice.strip().replace("\n", "<br/>"), S.note)]],
                    colWidths=[CONTENT_W])
        box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LIGHT), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        story.append(KeepTogether([box]))
        story.append(Spacer(1, 2 * mm))
    if sup.footer_note.strip():
        story.append(Paragraph(sup.footer_note.strip(), S.footer))
    return story


# ---------------------------------------------------------------- 2쪽~ : 세부내역
def _detail_pages(q: Quote, book: RateBook, res: QuoteResult, S: _Styles):
    story = [_title_row("시 설 대 여 견 적 서 <font size=13>(세부내역)</font>", q, S), Spacer(1, 5 * mm)]
    show_disc = res.discount > 0

    # 시설
    head = ["No", "이용일자", "호실", "건물/층", "인원", "이용시간", "시간", "사용료", "부가세", "합계"]
    widths = [8, 23, 22, 22, 13, 25, 11, 20, 18, 20]
    if show_disc:
        head += ["할인"]
        widths = [8, 21, 20, 20, 12, 23, 10, 19, 16, 19, 18]
    scale = CONTENT_W / (sum(widths) * mm)
    widths = [w * mm * scale for w in widths]
    rows = [head]
    lines = sorted(res.facility_lines, key=lambda ln: (ln.use.use_date, ln.use.start, ln.use.room))
    for i, ln in enumerate(lines, 1):
        r = ln.room
        row = [str(i), fmt_date(ln.use.use_date, short=True), ln.use.room,
               f"{r.building} {r.floor}" if r else "-", r.capacity if r else "-",
               f"{ln.use.start:%H:%M}~{ln.use.end:%H:%M}", f"{ln.hours}", fmt_won(ln.fee), fmt_won(ln.vat),
               fmt_won(ln.total)]
        if show_disc:
            row.append(f"{ln.discount:,}<br/><font size=7 color='#555555'>({fmt_rate(ln.use.rate)})</font>"
                       if ln.discount else "-")
            row[-1] = Paragraph(row[-1], S.cell_r)
        rows.append(row)
    if not lines:
        rows.append(["시설 이용 내역 없음"] + [""] * (len(head) - 1))
    a = res.facility_sum
    total_row = ["합계 (A)", "", "", "", "", "", f"{a.qty:,}", fmt_won(a.fee), fmt_won(a.vat), fmt_won(a.total)]
    if show_disc:
        total_row.append(fmt_won(sum(ln.discount for ln in lines)))
    rows.append(total_row)
    t = Table(rows, colWidths=widths, repeatRows=1)
    st = _grid_style(len(rows), total_rows=(len(rows) - 1,), align_right_from=7)
    st.add("SPAN", (0, len(rows) - 1), (5, len(rows) - 1))
    st.add("ALIGN", (6, 1), (6, -1), "CENTER")
    if not lines:
        st.add("SPAN", (0, 1), (-1, 1))
        st.add("TEXTCOLOR", (0, 1), (-1, 1), GREY)
        st.add("ALIGN", (0, 1), (-1, 1), "CENTER")
    t.setStyle(st)
    story += [Paragraph("1. 시설 사용 내역", S.h), t, Spacer(1, 1.5 * mm),
              Paragraph("※ 시설 사용료는 이용일자별로 기본 3시간 요금에 3시간 초과 시 1시간 단위(시작된 1시간 포함) "
                        "추가요금을 합산하여 산정하였습니다.", S.small),
              Spacer(1, 6 * mm)]

    # 기숙사
    head = ["No", "객실 구분", "입실일", "퇴실일", "숙박", "객실 수", "1박 단가", "사용료", "부가세", "합계"]
    widths = [8, 32, 22, 22, 13, 14, 18, 20, 18, 20]
    if show_disc:
        head += ["할인"]
        widths = [8, 30, 20, 20, 11, 13, 17, 19, 16, 19, 18]
    scale = CONTENT_W / (sum(widths) * mm)
    widths = [w * mm * scale for w in widths]
    rows = [head]
    dlines = sorted(res.dorm_lines, key=lambda ln: (ln.use.check_in, ln.use.dorm))
    for i, ln in enumerate(dlines, 1):
        row = [str(i), Paragraph(ln.use.dorm, S.cell), fmt_date(ln.use.check_in, short=True),
               fmt_date(ln.use.check_out, short=True), f"{ln.nights}박", f"{ln.use.count}실",
               fmt_won(ln.dorm.fee if ln.dorm else 0), fmt_won(ln.fee), fmt_won(ln.vat), fmt_won(ln.total)]
        if show_disc:
            row.append(Paragraph(f"{ln.discount:,}<br/><font size=7 color='#555555'>({fmt_rate(ln.use.rate)})"
                                 f"</font>" if ln.discount else "-", S.cell_r))
        rows.append(row)
    if not dlines:
        rows.append(["기숙사 이용 내역 없음"] + [""] * (len(head) - 1))
    b = res.dorm_sum
    total_row = ["합계 (B)", "", "", "", f"{b.qty:,}박" if b.qty else "-", f"{b.rooms:,}실" if b.rooms else "-",
                 "", fmt_won(b.fee), fmt_won(b.vat), fmt_won(b.total)]
    if show_disc:
        total_row.append(fmt_won(sum(ln.discount for ln in dlines)))
    rows.append(total_row)
    t = Table(rows, colWidths=widths, repeatRows=1)
    st = _grid_style(len(rows), total_rows=(len(rows) - 1,), align_right_from=6)
    st.add("SPAN", (0, len(rows) - 1), (3, len(rows) - 1))
    if not dlines:
        st.add("SPAN", (0, 1), (-1, 1))
        st.add("TEXTCOLOR", (0, 1), (-1, 1), GREY)
        st.add("ALIGN", (0, 1), (-1, 1), "CENTER")
    t.setStyle(st)
    story += [KeepTogether([Paragraph("2. 기숙사 사용 내역", S.h), t])] if len(rows) < 25 else \
        [Paragraph("2. 기숙사 사용 내역", S.h), t]
    return story


# ---------------------------------------------------------------- 쪽번호
def _numbered_canvas(footer_left: str, watermark: str | None):
    class NumberedCanvas(rl_canvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self._saved = []

        def showPage(self):
            self._saved.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            n = len(self._saved)
            for state in self._saved:
                self.__dict__.update(state)
                self.setFont(FONT, 7.5)
                self.setFillColor(GREY)
                self.setStrokeColor(LINE)
                self.setLineWidth(0.4)
                self.line(MARGIN, 11 * mm, PAGE_W - MARGIN, 11 * mm)
                self.drawString(MARGIN, 7.5 * mm, footer_left)
                self.drawRightString(PAGE_W - MARGIN, 7.5 * mm, f"{self._pageNumber} / {n}")
                if watermark:
                    self.saveState()
                    self.setFont(FONT_B, 110)
                    self.setFillColor(colors.HexColor("#000000"), alpha=0.05)
                    self.translate(PAGE_W / 2, PAGE_H / 2)
                    self.rotate(35)
                    self.drawCentredString(0, -35, watermark)
                    self.restoreState()
                super().showPage()
            super().save()
    return NumberedCanvas


def build_quote_pdf(q: Quote, book: RateBook, path: str) -> QuoteResult:
    _register_fonts()
    res = calculate(q, book)
    S = _Styles()
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=13 * mm,
                            bottomMargin=16 * mm, title=f"시설대여 견적서 {quote_no(q)}",
                            author=book.supplier.name, subject=q.company)
    story = _page_one(q, book, res, S)
    story.append(PageBreak())
    story += _detail_pages(q, book, res, S)
    footer = (f"{book.supplier.name}  |  견적번호 {quote_no(q)} ({'최종' if q.final else '가견적'})  |  "
              f"{q.company or ''}")
    doc.build(story, canvasmaker=_numbered_canvas(footer, None if q.final else "가 견 적"))
    return res


def rental_period_label(q: Quote) -> str:
    """파일명용 대관기간: 하루면 '10.8', 여러 날이면 '10.8~10.10'."""
    md = lambda d: f"{d.month}.{d.day}"  # noqa: E731
    start, end = q.start_date, q.end_date or q.start_date
    if not start:
        return ""
    return md(start) if end == start else f"{md(start)}~{md(end)}"


def default_pdf_name(q: Quote) -> str:
    """예) 261007_가견적02차_(10.8~10.10)중소벤처기업연수원 시설대여내역서_업체명.pdf"""
    company = "".join(ch for ch in (q.company or "") if ch not in '\\/:*?"<>|').strip() or "업체명"
    period = rental_period_label(q)
    kind = "최종" if q.final else "가견적"
    return f"{q.quote_date:%y%m%d}_{kind}{q.revision or '01'}차_({period})중소벤처기업연수원 시설대여내역서_{company}.pdf"
