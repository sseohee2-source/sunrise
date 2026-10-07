"""견적 데이터 구조와 사용료 계산 로직 (화면/PDF와 무관한 순수 계산부)."""
from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from datetime import date, time, datetime

BASE_HOURS = 3      # 기본요금에 포함되는 시간
VAT_RATE = 0.1      # 부가세

# 견적서 요약표에 표시되는 시설 구분(규모) 순서
FACILITY_GROUPS = [
    "강의실(50인미만)",
    "강의실(50인이상 100인미만)",
    "강의실(100인이상)",
    "컴퓨터실",
    "소강당",
    "대강당",
    "운동장",
]

FAMILY_DISCOUNT_KEY = "패밀리기업"
NO_DISCOUNT = "[해당없음]"


# ---------------------------------------------------------------- 기준 데이터
@dataclass
class Room:
    name: str            # 호실
    building: str        # 건물명
    floor: str           # 층
    capacity: str        # 수용인원 (예: "40", "500~1,000")
    kind: str            # 형태 (강의실, 웨비나실 ...)
    group: str           # 규모 (FACILITY_GROUPS 중 하나)
    base_fee: int        # 기본(3시간)
    extra_fee: int       # 추가 1시간당
    available: bool = True   # 대관 가능 여부 (False 이면 선택 목록에서 제외)
    note: str = ""


@dataclass
class DormType:
    name: str
    fee: int             # 1박 사용료


@dataclass
class Discount:
    name: str            # 대상
    category: str        # 구분 (면 제 / 50%감면 / 할인)
    rate: float | None   # 0~1, None 이면 담당자가 행별로 선택(패밀리기업)

    @property
    def is_manual(self) -> bool:
        return self.rate is None


@dataclass
class Supplier:
    title: str = "중소벤처기업연수원 시설 대여 견적"
    name: str = "중소벤처기업연수원"
    biz_no: str = "116-82-01561"
    ceo: str = "강석진"
    biz_type: str = "서비스, 부동산"
    biz_item: str = "교육서비스, 임대"
    address: str = "경기도 안산시 단원구 연수원로 87(원곡동)"
    # 담당자 연락처는 저장소에 두지 않는다: [담당자·안내문 설정]에서 입력하면 사용료기준.xlsx 에 저장된다
    manager: str = ""
    manager_email: str = ""
    office_tel: str = ""
    fax: str = ""
    cafeteria_note: str = " - 이용 1주일 전까지 구내식당 담당자에게 식수 제출 필수 / 비용 결제 별도"
    footer_note: str = ("※ 견적서 발급 후 대관 신청 서류(신청서, 사업자등록증, 행사일정표)를 "
                        "제출해주셔야 신청 절차가 완료됩니다.")
    notice: str = ("· 사용 2주 전까지 신청서를 제출해 주시기 바랍니다. (예약시간 양도 및 대리예약 불가)\n"
                   "· 시설 사용 승인 후 사용료는 사용 전일까지 납부해 주시기 바랍니다.\n"
                   "· 시설 사용료는 1일 기준(기본 3시간, 초과 시 1시간 단위 추가)이며, 이용일자별로 각각 산정합니다.\n"
                   "· 이용 가능 시간 : 강의실·실내체육관 09:00~20:00 / 강당·운동장 09:00~18:00 / 기숙사 입실~익일 11:00")
    family_guide: str = ("패밀리기업 할인 기준 (1회당, 시설별 사용 시 각 1일)\n"
                         " · (대)강의실·세미나실·소강당 : 100%, 한도 2일\n"
                         " · 운동장/체육관 : 100%, 한도 1일\n"
                         " · 기숙사 : 50%, 한도 5개실")


@dataclass
class RateBook:
    rooms: list[Room]
    dorms: list[DormType]
    discounts: list[Discount]
    supplier: Supplier

    def room(self, name: str) -> Room | None:
        return next((r for r in self.rooms if r.name == name), None)

    def dorm(self, name: str) -> DormType | None:
        return next((d for d in self.dorms if d.name == name), None)

    def discount(self, name: str) -> Discount | None:
        return next((d for d in self.discounts if d.name == name), None)

    def rentable_rooms(self) -> list[Room]:
        return [r for r in self.rooms if r.available]


# ---------------------------------------------------------------- 입력 데이터
@dataclass
class FacilityUse:
    use_date: date
    room: str
    start: time
    end: time
    rate: float = 0.0     # 할인률 (0~1)


@dataclass
class DormUse:
    check_in: date
    check_out: date
    dorm: str
    count: int = 1        # 객실 수
    rate: float = 0.0


@dataclass
class Quote:
    company: str = ""
    biz_no: str = ""
    ceo: str = ""
    cafeteria: str = "O"          # 식당이용여부 O / X (기본 O)
    contact: str = ""             # 담당자명
    office: str = ""
    mobile: str = ""
    email: str = ""
    start_date: date | None = None
    end_date: date | None = None
    quote_date: date = field(default_factory=date.today)
    revision: str = "01"          # 견적차수
    final: bool = False           # 최종견적 여부 (False = 가견적)
    memo: str = ""                # 차수별 변경 메모 (견적서에는 표시 안 함)
    discount: str = NO_DISCOUNT
    facilities: list[FacilityUse] = field(default_factory=list)
    dorms: list[DormUse] = field(default_factory=list)

    # ---- 저장/불러오기 (JSON)
    def to_dict(self) -> dict:
        def conv(v):
            if isinstance(v, (date, time)):
                return v.isoformat()
            if isinstance(v, list):
                return [conv(x) for x in v]
            if isinstance(v, dict):
                return {k: conv(x) for k, x in v.items()}
            return v
        return conv(asdict(self))

    @classmethod
    def from_dict(cls, d: dict) -> "Quote":
        def dt(s):
            return date.fromisoformat(s) if s else None

        def tm(s):
            return time.fromisoformat(s)

        q = cls()
        for k in ("company", "biz_no", "ceo", "cafeteria", "contact", "office", "mobile",
                  "email", "revision", "discount", "memo"):
            if k in d:
                setattr(q, k, d[k])
        q.final = bool(d.get("final", False))
        q.start_date = dt(d.get("start_date"))
        q.end_date = dt(d.get("end_date"))
        q.quote_date = dt(d.get("quote_date")) or date.today()
        q.facilities = [FacilityUse(dt(f["use_date"]), str(f["room"]), tm(f["start"]), tm(f["end"]),
                                    float(f.get("rate", 0))) for f in d.get("facilities", [])]
        q.dorms = [DormUse(dt(x["check_in"]), dt(x["check_out"]), x["dorm"], int(x.get("count", 1)),
                           float(x.get("rate", 0))) for x in d.get("dorms", [])]
        return q


# ---------------------------------------------------------------- 번호 서식
def digits(text: str) -> str:
    return "".join(ch for ch in (text or "") if ch.isdigit())


def fmt_biz_no(text: str) -> str:
    """사업자번호 10자리 → 123-45-67890 (그 외는 입력 그대로)."""
    d = digits(text)
    return f"{d[:3]}-{d[3:5]}-{d[5:]}" if len(d) == 10 else (text or "")


def fmt_phone(text: str) -> str:
    """전화번호 숫자 → 02-123-4567 / 031-123-4567 / 010-1234-5678 / 1588-1234."""
    d = digits(text)
    if not d:
        return text or ""
    if d.startswith("02") and len(d) in (9, 10):
        return f"02-{d[2:-4]}-{d[-4:]}"
    if len(d) == 8:
        return f"{d[:4]}-{d[4:]}"
    if len(d) in (10, 11):
        return f"{d[:3]}-{d[3:-4]}-{d[-4:]}"
    return text


def live_biz_no(text: str) -> str:
    """입력 중 사업자번호: 숫자만 받아 123-45-67890 형태로 점진 표시."""
    d = digits(text)[:10]
    return "-".join(p for p in (d[:3], d[3:5], d[5:]) if p)


def live_phone(text: str) -> str:
    """입력 중 전화번호: 숫자만 받아 02-123-4567 / 031-123-4567 / 010-1234-5678 형태로 점진 표시."""
    d = digits(text)[:11]
    if d.startswith("02"):
        d = d[:10]
        if len(d) <= 2:
            parts = [d]
        elif len(d) <= 5:
            parts = [d[:2], d[2:]]
        elif len(d) <= 9:
            parts = [d[:2], d[2:5], d[5:]]
        else:
            parts = [d[:2], d[2:6], d[6:]]
    elif len(d) == 8 and d[:2] in ("15", "16", "18"):
        parts = [d[:4], d[4:]]
    elif len(d) <= 3:
        parts = [d]
    elif len(d) <= 6:
        parts = [d[:3], d[3:]]
    elif len(d) <= 10:
        parts = [d[:3], d[3:6], d[6:]]
    else:
        parts = [d[:3], d[3:7], d[7:]]
    return "-".join(p for p in parts if p)


# ---------------------------------------------------------------- 계산
def won(x: float) -> int:
    """원 단위 반올림 (0.5 올림)."""
    return int(math.floor(x + 0.5))


def billable_hours(start: time, end: time) -> int:
    """이용시간. 시작된 1시간은 1시간으로 올림 (예: 09:30~13:00 → 4시간)."""
    minutes = (datetime.combine(date.min, end) - datetime.combine(date.min, start)).total_seconds() / 60
    if minutes <= 0:
        return 0
    return math.ceil(minutes / 60)


def facility_fee(room: Room, hours: int) -> int:
    """1일 사용료 = 기본(3시간) + 3시간 초과 1시간당 추가요금. 일자별로 각각 부과."""
    if hours <= 0:
        return 0
    return room.base_fee + room.extra_fee * max(0, hours - BASE_HOURS)


@dataclass
class FacilityLine:
    use: FacilityUse
    room: Room | None
    hours: int
    fee: int
    vat: int
    total: int
    discount: int


@dataclass
class DormLine:
    use: DormUse
    dorm: DormType | None
    nights: int
    fee: int
    vat: int
    total: int
    discount: int


@dataclass
class GroupSum:
    name: str
    rooms: int = 0      # 호실 수 / 객실 수
    qty: int = 0        # 이용시간 / 숙박일수
    fee: int = 0
    vat: int = 0
    total: int = 0


@dataclass
class QuoteResult:
    facility_lines: list[FacilityLine]
    dorm_lines: list[DormLine]
    facility_groups: list[GroupSum]
    dorm_groups: list[GroupSum]
    facility_sum: GroupSum      # 합계(A)
    dorm_sum: GroupSum          # 합계(B)
    subtotal: int               # C = A + B
    discount: int               # D
    grand_total: int            # E = C - D


def calculate(q: Quote, book: RateBook) -> QuoteResult:
    f_lines: list[FacilityLine] = []
    for u in q.facilities:
        room = book.room(u.room)
        hours = billable_hours(u.start, u.end)
        fee = facility_fee(room, hours) if room else 0
        vat = won(fee * VAT_RATE)
        total = fee + vat
        f_lines.append(FacilityLine(u, room, hours, fee, vat, total, won(total * u.rate)))

    d_lines: list[DormLine] = []
    for u in q.dorms:
        dorm = book.dorm(u.dorm)
        nights = max(0, (u.check_out - u.check_in).days)
        fee = dorm.fee * nights * u.count if dorm else 0
        vat = won(fee * VAT_RATE)
        total = fee + vat
        d_lines.append(DormLine(u, dorm, nights, fee, vat, total, won(total * u.rate)))

    # 시설 구분별 요약 (호실 수는 같은 호실을 여러 날 써도 1실)
    f_groups = [GroupSum(g) for g in FACILITY_GROUPS]
    extra_groups: dict[str, GroupSum] = {}
    seen_rooms: dict[str, set] = {}
    for ln in f_lines:
        if not ln.room:
            continue
        g = next((x for x in f_groups if x.name == ln.room.group), None)
        if g is None:
            g = extra_groups.setdefault(ln.room.group, GroupSum(ln.room.group))
        seen_rooms.setdefault(g.name, set()).add(ln.room.name)
        g.rooms = len(seen_rooms[g.name])
        g.qty += ln.hours
        g.fee += ln.fee
        g.vat += ln.vat
        g.total += ln.total
    f_groups += list(extra_groups.values())

    d_groups = [GroupSum(d.name) for d in book.dorms]
    for ln in d_lines:
        g = next((x for x in d_groups if x.name == ln.use.dorm), None)
        if g is None:
            g = GroupSum(ln.use.dorm)
            d_groups.append(g)
        g.rooms += ln.use.count
        g.qty += ln.nights
        g.fee += ln.fee
        g.vat += ln.vat
        g.total += ln.total

    def total_of(groups, name):
        s = GroupSum(name)
        for g in groups:
            s.rooms += g.rooms
            s.qty += g.qty
            s.fee += g.fee
            s.vat += g.vat
            s.total += g.total
        return s

    a = total_of(f_groups, "합계(A)")
    b = total_of(d_groups, "합계(B)")
    subtotal = a.total + b.total
    disc = sum(ln.discount for ln in f_lines) + sum(ln.discount for ln in d_lines)
    return QuoteResult(f_lines, d_lines, f_groups, d_groups, a, b, subtotal, disc, subtotal - disc)
