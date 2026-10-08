import os
from datetime import date, time

import pytest

from quote_app.model import DormUse, FacilityUse, Quote, billable_hours, calculate
from quote_app.rates import default_book, load_book, save_book
from quote_app.store import QuoteCase

BOOK = default_book()


def q_with(facilities=(), dorms=()):
    return Quote(company="테스트", facilities=list(facilities), dorms=list(dorms))


@pytest.mark.parametrize("start,end,hours", [
    (time(9), time(12), 3), (time(9), time(18), 9), (time(9, 30), time(13), 4), (time(9), time(9, 1), 1),
    (time(13), time(9), 0),
])
def test_billable_hours_rounds_up(start, end, hours):
    assert billable_hours(start, end) == hours


def test_base_fee_covers_three_hours():
    r = calculate(q_with([FacilityUse(date(2026, 1, 5), "205", time(9), time(11))]), BOOK)
    assert r.facility_lines[0].fee == 100_000


def test_each_day_charged_separately():
    # 301호(150,000 / 30,000) 2일 × 9시간 → 일자별 150,000 + 6×30,000
    uses = [FacilityUse(date(2026, 1, d), "301", time(9), time(18)) for d in (5, 6)]
    r = calculate(q_with(uses), BOOK)
    assert [ln.fee for ln in r.facility_lines] == [330_000, 330_000]
    g = next(g for g in r.facility_groups if g.name == "강의실(50인이상 100인미만)")
    assert (g.rooms, g.qty, g.fee, g.vat, g.total) == (1, 18, 660_000, 66_000, 726_000)


def test_100_person_room_is_100_plus_tier():
    assert BOOK.room("다목적강의실").group == "강의실(100인이상)"
    assert BOOK.room("다목적강의실").base_fee == 200_000


def test_auditorium_and_ground_fees():
    uses = [FacilityUse(date(2026, 1, 5), "대강당", time(9), time(14)),
            FacilityUse(date(2026, 1, 5), "운동장", time(9), time(12))]
    r = calculate(q_with(uses), BOOK)
    assert [ln.fee for ln in r.facility_lines] == [500_000 + 2 * 100_000, 300_000]


def test_dorm_fee_and_types():
    assert [d.name for d in BOOK.dorms] == ["1인실", "2인실", "콘도형 A", "단체실 및 콘도형 B"]
    r = calculate(q_with(dorms=[DormUse(date(2026, 1, 5), date(2026, 1, 7), "2인실", 3)]), BOOK)
    assert r.dorm_lines[0].fee == 40_000 * 2 * 3
    assert r.dorm_sum.total == 264_000


def test_discount_and_grand_total():
    uses = [FacilityUse(date(2026, 1, 5), "205", time(9), time(12), rate=0.5)]
    dorms = [DormUse(date(2026, 1, 5), date(2026, 1, 6), "1인실", 1, rate=1.0)]
    r = calculate(q_with(uses, dorms), BOOK)
    assert r.subtotal == 110_000 + 33_000
    assert r.discount == 55_000 + 33_000
    assert r.grand_total == 55_000


def test_unavailable_rooms_hidden():
    names = {r.name for r in BOOK.rentable_rooms()}
    assert "301" in names and "111" not in names and "118-1" not in names and "실험동 101" not in names


def test_rate_book_roundtrip(tmp_path):
    p = tmp_path / "rates.xlsx"
    save_book(BOOK, str(p))
    b = load_book(str(p))
    assert b == BOOK


def test_versions_and_single_final(tmp_path):
    case = QuoteCase()
    q1 = q_with([FacilityUse(date(2026, 1, 5), "205", time(9), time(12))])
    q1.final = True
    case.save_version(q1, BOOK, as_new=False)
    q2 = Quote.from_dict(q1.to_dict())
    case.save_version(q2, BOOK, as_new=True)
    assert [v.quote.revision for v in case.versions] == ["01", "02"]
    assert [v.quote.final for v in case.versions] == [False, True]
    path = case.save(str(tmp_path / "c.json"))
    loaded = QuoteCase.load(path)
    assert loaded.final_version.quote.revision == "02"
    assert loaded.versions[0].quote.facilities == q1.facilities
    assert loaded.versions[1].grand_total == 110_000


def test_pdf_builds(tmp_path):
    from quote_app.pdf_quote import build_quote_pdf, korean_amount
    assert korean_amount(1_617_000) == "일백육십일만칠천"
    q = q_with([FacilityUse(date(2026, 1, 5), "301", time(9), time(18))],
               [DormUse(date(2026, 1, 5), date(2026, 1, 6), "1인실", 2)])
    out = tmp_path / "q.pdf"
    build_quote_pdf(q, BOOK, str(out))
    assert out.stat().st_size > 10_000


def _save_case(tmp_path, biz, end, finals, company="A사"):
    case = QuoteCase()
    for i, fin in enumerate(finals):
        q = Quote(company=company, biz_no=biz, start_date=end, end_date=end,
                  facilities=[FacilityUse(end, "205", time(9), time(12))])
        q.final = fin
        q.memo = f"v{i + 1}"
        case.save_version(q, BOOK, as_new=bool(case.versions))
    case.save(str(tmp_path / f"{case.case_id}.json"))
    return case


def test_cases_by_biz_ignores_hyphens(tmp_path):
    from quote_app.store import cases_by_biz
    a = _save_case(tmp_path, "123-45-67890", date(2026, 3, 1), [False])
    _save_case(tmp_path, "1234567890", date(2026, 5, 1), [False, True])
    _save_case(tmp_path, "999-99-99999", date(2026, 5, 1), [False], company="B사")
    found = cases_by_biz("123 45 67890", str(tmp_path))
    assert [c.end_date for c in found] == [date(2026, 5, 1), date(2026, 3, 1)]
    assert found[0].status.startswith("최종(02차)")
    assert len(cases_by_biz("1234567890", str(tmp_path), exclude_case_id=a.case_id)) == 1
    assert cases_by_biz("123", str(tmp_path)) == []


def test_prune_keeps_only_final_after_one_month(tmp_path):
    from quote_app.store import prune_old_versions
    old = _save_case(tmp_path, "1234567890", date(2026, 1, 31), [False, True, False])
    recent = _save_case(tmp_path, "1234567890", date(2026, 2, 20), [False, False])
    no_final = _save_case(tmp_path, "1234567890", date(2026, 1, 10), [False, False])
    # 1/31 + 1개월 = 2/28 → 3/1 부터 정리 대상
    assert prune_old_versions(str(tmp_path), today=date(2026, 2, 28)) == 1     # no_final 만 (1/10 → 2/10)
    assert prune_old_versions(str(tmp_path), today=date(2026, 3, 1)) == 2
    o = QuoteCase.load(old.path)
    assert [(v.quote.revision, v.quote.final) for v in o.versions] == [("02", True)]
    assert len(QuoteCase.load(recent.path).versions) == 2
    assert [v.quote.memo for v in QuoteCase.load(no_final.path).versions] == ["v2"]


def test_archived_case_overwrite_updates_modified(tmp_path):
    c = _save_case(tmp_path, "1234567890", date(2026, 1, 10), [True, False])
    assert not c.is_archived(date(2026, 2, 10)) and c.is_archived(date(2026, 2, 11))
    v = c.final_version
    created = v.created_at
    v.saved_at = "2000-01-01 00:00"
    q = Quote.from_dict(v.quote.to_dict())
    c.save_version(q, BOOK, as_new=False)
    assert c.final_version.created_at == created
    assert c.final_version.saved_at != "2000-01-01 00:00"


def test_pdf_file_name():
    from quote_app.pdf_quote import default_pdf_name
    q = Quote(company="(주)테스트/기업", quote_date=date(2026, 10, 7), start_date=date(2026, 10, 8),
              end_date=date(2026, 10, 8), revision="02")
    assert default_pdf_name(q) == "261007_가견적02차_(10.8)중소벤처기업연수원 시설대여내역서_(주)테스트기업.pdf"
    q.end_date = date(2026, 11, 30)
    q.final = True
    assert default_pdf_name(q) == "261007_최종02차_(10.8~11.30)중소벤처기업연수원 시설대여내역서_(주)테스트기업.pdf"


def test_number_formatting():
    from quote_app.model import fmt_biz_no, fmt_phone
    assert fmt_biz_no("1234567890") == "123-45-67890"
    assert fmt_phone("01012345678") == "010-1234-5678"
    assert fmt_phone("0311234567") == "031-123-4567"
    assert fmt_phone("021234567") == "02-123-4567"
    assert fmt_phone("0212345678") == "02-1234-5678"
    assert fmt_phone("15881234") == "1588-1234"
    assert fmt_phone("010-1234-5678") == "010-1234-5678"


def test_cafeteria_defaults_to_o():
    assert Quote().cafeteria == "O"
    assert Quote.from_dict({}).cafeteria == "O"


def test_live_number_format():
    from quote_app.model import live_biz_no, live_phone
    assert [live_biz_no("1234567890"[:n]) for n in (2, 4, 6, 10)] == ["12", "123-4", "123-45-6", "123-45-67890"]
    assert live_biz_no("123-45-678901") == "123-45-67890"
    assert live_phone("01012345678") == "010-1234-5678"
    assert live_phone("0101234") == "010-123-4"
    assert live_phone("0311234567") == "031-123-4567"
    assert live_phone("021234567") == "02-123-4567"
    assert live_phone("0212345678") == "02-1234-5678"
    assert live_phone("15881234") == "1588-1234"


def test_facility_sort_date_then_room_order():
    import copy
    book = copy.deepcopy(BOOK)
    uses = [FacilityUse(date(2026, 1, 6), "205", time(9), time(12)),
            FacilityUse(date(2026, 1, 5), "대강당", time(9), time(12)),
            FacilityUse(date(2026, 1, 5), "301", time(13), time(15)),
            FacilityUse(date(2026, 1, 5), "205", time(9), time(12))]
    order = lambda b: [(u.use_date.day, u.room) for u in sorted(uses, key=b.facility_sort_key)]  # noqa: E731
    assert order(book) == [(5, "205"), (5, "301"), (5, "대강당"), (6, "205")]
    # 기준 관리에서 대강당을 맨 앞으로 옮기면 같은 날짜 안에서 대강당이 먼저
    book.rooms.insert(0, book.rooms.pop(next(i for i, r in enumerate(book.rooms) if r.name == "대강당")))
    assert order(book) == [(5, "대강당"), (5, "205"), (5, "301"), (6, "205")]
