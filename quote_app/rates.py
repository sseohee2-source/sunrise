"""사용료 기준(시설·기숙사·할인·공급자정보)을 엑셀 파일로 읽고 쓴다.

exe 옆의 `사용료기준.xlsx` 를 사용하며, 없으면 규정 기본값으로 새로 만든다.
규정이 바뀌면 이 엑셀만 수정하면 된다.
"""
from __future__ import annotations

import os
import sys
from dataclasses import fields
from datetime import date, datetime

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

from .model import (BASIS_POLICY, BASIS_RULE, DEFAULT_RULE_DATE, DEFAULT_RULE_NAME, FACILITY_GROUPS,
                    FAMILY_DISCOUNT_KEY, NO_DISCOUNT, Discount, DormSchedule, DormType, FeeSchedule, RateBook,
                    Room, Supplier)

RATE_FILE_NAME = "사용료기준.xlsx"

# 규모별 규정 요금 (기본 3시간, 추가 1시간당)
GROUP_FEES = {
    "강의실(50인미만)": (100_000, 20_000),
    "강의실(50인이상 100인미만)": (150_000, 30_000),
    "강의실(100인이상)": (200_000, 40_000),
    "컴퓨터실": (300_000, 20_000),
    "소강당": (300_000, 60_000),
    "대강당": (500_000, 100_000),
    "운동장": (300_000, 100_000),
}

_ROOMS = [
    # 호실, 건물, 층, 인원, 형태, 규모, 비고
    ("CEO룸", "봉사관", "1층", "20", "강의실", "강의실(50인미만)", ""),
    ("111", "봉사관", "1층", "40", "강의실", "강의실(50인미만)", "창고로 사용"),
    ("112", "봉사관", "1층", "60", "강의실", "강의실(50인이상 100인미만)", ""),
    ("118-1", "봉사관", "1층", "2", "웨비나실", "강의실(50인미만)", "연수팀 사용(대관 시 협의)"),
    ("118-2", "봉사관", "1층", "2", "웨비나실", "강의실(50인미만)", "연수팀 사용(대관 시 협의)"),
    ("118-3", "봉사관", "1층", "2", "웨비나실", "강의실(50인미만)", "연수팀 사용(대관 시 협의)"),
    ("118-4", "봉사관", "1층", "2", "웨비나실", "강의실(50인미만)", "연수지원팀"),
    ("205", "봉사관", "2층", "15", "강의실", "강의실(50인미만)", ""),
    ("207", "봉사관", "2층", "40", "강의실", "강의실(50인미만)", ""),
    ("208", "봉사관", "2층", "40", "강의실", "강의실(50인미만)", ""),
    ("209", "봉사관", "2층", "40", "강의실", "강의실(50인미만)", ""),
    ("210(PC)", "봉사관", "2층", "40", "컴퓨터실", "컴퓨터실", ""),
    ("212", "봉사관", "2층", "20", "강의실", "강의실(50인미만)", ""),
    ("301", "봉사관", "3층", "80", "강의실", "강의실(50인이상 100인미만)", ""),
    ("302", "봉사관", "3층", "70", "강의실", "강의실(50인이상 100인미만)", ""),
    ("305", "봉사관", "3층", "70", "강의실", "강의실(50인이상 100인미만)", ""),
    ("309", "봉사관", "3층", "30", "강의실", "강의실(50인미만)", ""),
    ("310", "봉사관", "3층", "40", "강의실", "강의실(50인미만)", ""),
    ("311", "봉사관", "3층", "24", "강의실", "강의실(50인미만)", "창고로 사용"),
    ("313", "봉사관", "3층", "24", "강의실", "강의실(50인미만)", ""),
    ("315", "봉사관", "3층", "24", "강의실", "강의실(50인미만)", ""),
    ("317", "봉사관", "3층", "24", "강의실", "강의실(50인미만)", ""),
    ("322", "봉사관", "3층", "30", "강의실", "강의실(50인미만)", ""),
    ("326", "봉사관", "3층", "30", "강의실", "강의실(50인미만)", ""),
    ("327", "봉사관", "3층", "40", "강의실", "강의실(50인미만)", ""),
    ("328", "봉사관", "3층", "40", "강의실", "강의실(50인미만)", ""),
    ("다목적강의실", "인화2관", "1층", "100", "강의실", "강의실(100인이상)", ""),
    ("비즈니스룸", "인화2관", "1층", "10", "강의실", "강의실(50인미만)", ""),
    ("운동장", "운동장", "야외", "500~1,000", "운동장", "운동장", ""),
    ("소강당", "봉사관", "1층", "162", "소강당", "소강당", ""),
    ("대강당", "창의관", "1층", "421", "대강당", "대강당", ""),
    ("실험동 101", "실험동", "1층", "30", "강의실", "강의실(50인미만)", "대관X, 필요시 협의"),
    ("실험동 106", "실험동", "1층", "30", "강의실", "강의실(50인미만)", "대관X, 필요시 협의"),
    ("실험동 201", "실험동", "2층", "30", "강의실", "강의실(50인미만)", "대관X, 필요시 협의"),
    ("실험동 209", "실험동", "2층", "30", "강의실", "강의실(50인미만)", "대관X, 필요시 협의"),
    ("실험동 210", "실험동", "2층", "30", "강의실", "강의실(50인미만)", "대관X, 필요시 협의"),
]

_DORMS = [("1인실", 30_000), ("2인실", 40_000), ("콘도형 A", 60_000), ("단체실 및 콘도형 B", 100_000)]

_DISCOUNTS = [
    ("[면제]정부 부처 및 지방자치단체", "면 제", 1.0),
    ("[면제]중진공과 공동으로 사업을 추진하는 공공기관 또는 유관단체", "면 제", 1.0),
    ("[면제]연수원 소재 지역 관공서 및 상공회의소 등 연수원과 유대가 필요한 지역 사회단체", "면 제", 1.0),
    ("[면제]협약기간내의 청년창업사관학교 입교생이 사용하는 창업준비공간(장비 포함)", "면 제", 1.0),
    ("[면제]그 밖의 시설개방 목적상 사용료를 면제함이 타당하다고 인정되는 자", "면 제", 1.0),
    ("[50%감면]공공기관 및 유관단체", "50%감면", 0.5),
    ("[50%감면](사)글로벌최고경영자클럽, (사)중소기업융합중앙회 등 유관 중소기업 경영자 협·단체 및 연수수료자 동우회",
     "50%감면", 0.5),
    ("[50%감면]협약기간내의 청년창업사관학교 입교생 및 경영후계자", "50%감면", 0.5),
    ("[50%감면]그 밖에 시설개방 목적상 사용료를 감면함이 타당하다고 인정되는 자", "50%감면", 0.5),
    ("[할인] 패밀리기업 할인", "할인", None),
]


def _default_discount(name: str, category: str, rate: float | None) -> Discount:
    if rate is None:     # 패밀리기업 등 내부 방침결재에 따른 할인 (문서번호·결재일은 담당자가 입력)
        return Discount(name, category, rate, BASIS_POLICY, "", None)
    return Discount(name, category, rate, BASIS_RULE, DEFAULT_RULE_NAME, DEFAULT_RULE_DATE)


def default_book() -> RateBook:
    rooms = []
    for name, bld, fl, cap, kind, group, note in _ROOMS:
        base, extra = GROUP_FEES[group]
        rooms.append(Room(name, bld, fl, cap, kind, group, base, extra, available=not note, note=note))
    return RateBook(rooms=rooms,
                    dorms=[DormType(n, f) for n, f in _DORMS],
                    discounts=[_default_discount(n, c, r) for n, c, r in _DISCOUNTS],
                    supplier=Supplier(),
                    fac_schedules=[FeeSchedule(DEFAULT_RULE_DATE, DEFAULT_RULE_NAME,
                                               {r.name: (r.base_fee, r.extra_fee) for r in rooms})],
                    dorm_schedules=[DormSchedule(DEFAULT_RULE_DATE, DEFAULT_RULE_NAME, dict(_DORMS))])


# ---------------------------------------------------------------- 파일 위치
def app_dir() -> str:
    """exe(또는 실행 스크립트)가 있는 폴더."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def resource_path(*parts: str) -> str:
    """exe 내부에 포함된 리소스 경로."""
    base = getattr(sys, "_MEIPASS", None)
    base = os.path.join(base, "quote_app") if base else os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, *parts)


def rate_file_path() -> str:
    return os.path.join(app_dir(), RATE_FILE_NAME)


# ---------------------------------------------------------------- 읽기/쓰기
ROOM_HEADERS = ["호실", "건물명", "층", "수용인원", "형태", "규모(구분)", "대관가능(O/X)", "비고"]
FAC_FEE_HEADERS = ["시행일", "근거", "호실", "기본(3시간)", "추가 1시간당"]
DORM_HEADERS = ["구분"]
DORM_FEE_HEADERS = ["시행일", "근거", "구분", "1박 사용료"]
DISC_HEADERS = ["대상", "구분", "할인률(%)", "근거 구분(규정/내부방침)", "근거(규정명 또는 결재 문서번호)",
                "시행일 또는 결재일", "비고"]
SUPPLIER_LABELS = {
    "title": "견적명", "name": "공급자", "biz_no": "사업자번호", "ceo": "대표", "biz_type": "업태",
    "biz_item": "종목", "address": "주소", "manager": "담당자", "manager_email": "이메일",
    "office_tel": "사무실", "fax": "FAX", "cafeteria_note": "구내식당 안내문",
    "footer_note": "견적서 하단 안내문", "notice": "유의사항", "family_guide": "패밀리기업 할인 안내",
}

_HEAD_FONT = Font(bold=True, color="FFFFFF")
_HEAD_FILL = PatternFill("solid", fgColor="404040")
_DATE_FMT = "yyyy.mm.dd"


def _header(ws, headers, widths):
    ws.append(headers)
    for i, w in enumerate(widths, start=1):
        c = ws.cell(1, i)
        c.font, c.fill = _HEAD_FONT, _HEAD_FILL
        c.alignment = Alignment(horizontal="center")
        ws.column_dimensions[c.column_letter].width = w
    ws.freeze_panes = "A2"


def save_book(book: RateBook, path: str) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "시설"
    _header(ws, ROOM_HEADERS, [14, 10, 7, 11, 10, 28, 13, 28])
    for r in book.rooms:
        ws.append([r.name, r.building, r.floor, r.capacity, r.kind, r.group, "O" if r.available else "X", r.note])
    dv = DataValidation(type="list", formula1='"' + ",".join(FACILITY_GROUPS) + '"', allow_blank=False)
    dv.add("F2:F500")
    ws.add_data_validation(dv)
    dv2 = DataValidation(type="list", formula1='"O,X"')
    dv2.add("G2:G500")
    ws.add_data_validation(dv2)

    ws = wb.create_sheet("시설요금")
    _header(ws, FAC_FEE_HEADERS, [12, 22, 14, 13, 13])
    for sc in sorted(book.fac_schedules, key=lambda x: x.effective):
        for r in book.rooms:
            base, extra = sc.fees.get(r.name, (r.base_fee, r.extra_fee))
            ws.append([sc.effective, sc.basis, r.name, base, extra])
            ws.cell(ws.max_row, 1).number_format = _DATE_FMT
            for c in (4, 5):
                ws.cell(ws.max_row, c).number_format = "#,##0"

    ws = wb.create_sheet("기숙사")
    _header(ws, DORM_HEADERS, [22])
    for d in book.dorms:
        ws.append([d.name])

    ws = wb.create_sheet("기숙사요금")
    _header(ws, DORM_FEE_HEADERS, [12, 22, 22, 13])
    for sc in sorted(book.dorm_schedules, key=lambda x: x.effective):
        for d in book.dorms:
            ws.append([sc.effective, sc.basis, d.name, sc.fees.get(d.name, d.fee)])
            ws.cell(ws.max_row, 1).number_format = _DATE_FMT
            ws.cell(ws.max_row, 4).number_format = "#,##0"

    ws = wb.create_sheet("할인기준")
    _header(ws, DISC_HEADERS, [80, 10, 11, 14, 30, 14, 34])
    for d in book.discounts:
        ws.append([d.name, d.category, None if d.rate is None else round(d.rate * 100, 4), d.basis_kind, d.basis,
                   d.basis_date, "할인률을 비워두면 담당자가 행별로 선택" if d.rate is None else ""])
        ws.cell(ws.max_row, 6).number_format = _DATE_FMT

    ws = wb.create_sheet("공급자정보")
    _header(ws, ["항목", "값", "키(수정금지)"], [20, 90, 16])
    for f in fields(Supplier):
        ws.append([SUPPLIER_LABELS.get(f.name, f.name), getattr(book.supplier, f.name), f.name])
        ws.cell(ws.max_row, 2).alignment = Alignment(wrap_text=True, vertical="top")

    wb.save(path)


def _s(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _i(v) -> int:
    if v in (None, ""):
        return 0
    return int(round(float(str(v).replace(",", ""))))


def parse_date(v) -> date | None:
    """엑셀 날짜 셀 또는 '2024.06.24', '2024-06-24', '20240624' 형식."""
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    d = "".join(ch for ch in str(v) if ch.isdigit())
    if len(d) == 8:
        try:
            return date(int(d[:4]), int(d[4:6]), int(d[6:]))
        except ValueError:
            return None
    return None


def _rows_by_header(ws):
    """첫 줄 머리글 이름으로 각 줄을 dict 로 읽는다 (열 순서가 바뀌어도 동작)."""
    rows = ws.iter_rows(values_only=True)
    head = [_s(h) for h in next(rows, [])]
    for row in rows:
        if row and any(v not in (None, "") for v in row):
            yield {h: (row[i] if i < len(row) else None) for i, h in enumerate(head) if h}


def load_book(path: str) -> RateBook:
    wb = load_workbook(path, data_only=True)
    rooms, legacy_fees = [], {}
    for r in _rows_by_header(wb["시설"]):
        name = _s(r.get("호실"))
        if not name:
            continue
        group = _s(r.get("규모(구분)"))
        base, extra = GROUP_FEES.get(group, (0, 0))
        if "기본(3시간)" in r:          # 예전 형식: 시설 시트에 요금이 함께 있음
            base, extra = _i(r.get("기본(3시간)")), _i(r.get("추가 1시간당"))
            legacy_fees[name] = (base, extra)
        rooms.append(Room(name, _s(r.get("건물명")), _s(r.get("층")), _s(r.get("수용인원")), _s(r.get("형태")),
                          group, base, extra, available=_s(r.get("대관가능(O/X)")).upper() != "X",
                          note=_s(r.get("비고"))))

    fac_scheds: dict[date, FeeSchedule] = {}
    if "시설요금" in wb.sheetnames:
        for r in _rows_by_header(wb["시설요금"]):
            eff, name = parse_date(r.get("시행일")), _s(r.get("호실"))
            if not eff or not name:
                continue
            sc = fac_scheds.setdefault(eff, FeeSchedule(eff, _s(r.get("근거")) or DEFAULT_RULE_NAME, {}))
            sc.fees[name] = (_i(r.get("기본(3시간)")), _i(r.get("추가 1시간당")))
    if not fac_scheds:     # 예전 형식 → 현행 규정(2024.06.24. 개정) 기준 하나로
        fac_scheds[DEFAULT_RULE_DATE] = FeeSchedule(
            DEFAULT_RULE_DATE, DEFAULT_RULE_NAME, legacy_fees or {r.name: (r.base_fee, r.extra_fee) for r in rooms})

    dorms, legacy_dorm = [], {}
    for r in _rows_by_header(wb["기숙사"]):
        name = _s(r.get("구분"))
        if not name:
            continue
        fee = _i(r.get("1박 사용료")) if "1박 사용료" in r else dict(_DORMS).get(name, 0)
        if "1박 사용료" in r:
            legacy_dorm[name] = fee
        dorms.append(DormType(name, fee))
    dorm_scheds: dict[date, DormSchedule] = {}
    if "기숙사요금" in wb.sheetnames:
        for r in _rows_by_header(wb["기숙사요금"]):
            eff, name = parse_date(r.get("시행일")), _s(r.get("구분"))
            if not eff or not name:
                continue
            sc = dorm_scheds.setdefault(eff, DormSchedule(eff, _s(r.get("근거")) or DEFAULT_RULE_NAME, {}))
            sc.fees[name] = _i(r.get("1박 사용료"))
    if not dorm_scheds:
        dorm_scheds[DEFAULT_RULE_DATE] = DormSchedule(DEFAULT_RULE_DATE, DEFAULT_RULE_NAME,
                                                      legacy_dorm or {d.name: d.fee for d in dorms})

    discounts = []
    for r in _rows_by_header(wb["할인기준"]):
        name = _s(r.get("대상"))
        if not name:
            continue
        rate = r.get("할인률(%)")
        rate = None if rate in (None, "") else float(str(rate).replace("%", "")) / 100
        if "근거 구분(규정/내부방침)" in r:
            kind = _s(r.get("근거 구분(규정/내부방침)")) or BASIS_RULE
            kind = BASIS_POLICY if "내부" in kind or "방침" in kind else BASIS_RULE
            discounts.append(Discount(name, _s(r.get("구분")), rate, kind,
                                      _s(r.get("근거(규정명 또는 결재 문서번호)")),
                                      parse_date(r.get("시행일 또는 결재일"))))
        else:                 # 예전 형식
            discounts.append(_default_discount(name, _s(r.get("구분")), rate))

    sup = Supplier()
    if "공급자정보" in wb.sheetnames:
        names = {f.name for f in fields(Supplier)}
        for r in wb["공급자정보"].iter_rows(min_row=2, values_only=True):
            if r and len(r) > 2 and r[2] in names:
                setattr(sup, r[2], "" if r[1] is None else str(r[1]))
    return RateBook(rooms, dorms, discounts, sup, sorted(fac_scheds.values(), key=lambda x: x.effective),
                    sorted(dorm_scheds.values(), key=lambda x: x.effective))


def load_or_create(path: str | None = None) -> tuple[RateBook, str]:
    path = path or rate_file_path()
    if not os.path.exists(path):
        book = default_book()
        try:
            save_book(book, path)
        except OSError:
            pass
        return book, path
    return load_book(path), path


def discount_choices(book: RateBook) -> list[Discount]:
    return [Discount(NO_DISCOUNT, "해당없음", 0.0)] + book.discounts


def is_family(d: Discount | None) -> bool:
    return d is not None and (d.rate is None or FAMILY_DISCOUNT_KEY in d.name)
