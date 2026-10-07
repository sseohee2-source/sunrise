"""견적 건(case)과 차수(version) 이력 저장.

한 건 = 한 고객의 한 대관 문의. 건마다 JSON 파일 1개에 차수별 견적을 모두 보관한다.
저장 위치: exe 옆 `견적데이터` 폴더.
"""
from __future__ import annotations

import json
import os
import calendar
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime

from .model import Quote, RateBook, calculate
from .rates import app_dir

STORE_DIR_NAME = "견적데이터"
RETENTION_MONTHS = 1    # 대관종료일 후 이 기간이 지나면 최종 견적만 보관


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    y, m = d.year + y, m + 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def store_dir() -> str:
    d = os.path.join(app_dir(), STORE_DIR_NAME)
    os.makedirs(d, exist_ok=True)
    return d


@dataclass
class Version:
    quote: Quote
    saved_at: str = ""          # 최종 수정 시각 (저장할 때마다 갱신)
    grand_total: int = 0        # 저장 당시 총 견적액 (목록 표시용)
    created_at: str = ""        # 최초 작성 시각

    def to_dict(self) -> dict:
        return {"created_at": self.created_at, "saved_at": self.saved_at, "grand_total": self.grand_total,
                "quote": self.quote.to_dict()}

    @classmethod
    def from_dict(cls, d: dict) -> "Version":
        saved = d.get("saved_at", "")
        return cls(Quote.from_dict(d["quote"]), saved, int(d.get("grand_total", 0)), d.get("created_at", saved))


@dataclass
class QuoteCase:
    case_id: str = field(default_factory=lambda: datetime.now().strftime("%Y%m%d%H%M%S") + "-" +
                         uuid.uuid4().hex[:6])
    versions: list[Version] = field(default_factory=list)
    path: str | None = None

    # ---- 조회
    @property
    def latest(self) -> Version | None:
        return self.versions[-1] if self.versions else None

    @property
    def final_version(self) -> Version | None:
        return next((v for v in self.versions if v.quote.final), None)

    def version(self, revision: str) -> Version | None:
        return next((v for v in self.versions if v.quote.revision == revision), None)

    def next_revision(self) -> str:
        nums = [int(v.quote.revision) for v in self.versions if str(v.quote.revision).isdigit()]
        return f"{(max(nums) + 1) if nums else 1:02d}"

    # ---- 변경
    def save_version(self, q: Quote, book: RateBook, as_new: bool) -> Version:
        """as_new=True 면 새 차수로 추가, False 면 같은 차수를 덮어쓴다."""
        if as_new or not self.version(q.revision):
            if as_new:
                q.revision = self.next_revision()
            v = Version(q)
            self.versions.append(v)
        else:
            v = self.version(q.revision)
            v.quote = q
        if q.final:     # 최종은 건당 하나
            for other in self.versions:
                if other is not v:
                    other.quote.final = False
        v.saved_at = datetime.now().strftime("%Y-%m-%d %H:%M")
        if not v.created_at:
            v.created_at = v.saved_at
        v.grand_total = calculate(q, book).grand_total
        self.versions.sort(key=lambda x: x.quote.revision)
        return v

    def retention_end(self) -> date | None:
        """이 날짜가 지나면 최종 견적만 보관 (대관종료일 + 1개월)."""
        keep = self.final_version or self.latest
        if keep is None:
            return None
        end = keep.quote.end_date or max((v.quote.end_date for v in self.versions if v.quote.end_date),
                                         default=None)
        return add_months(end, RETENTION_MONTHS) if end else None

    def is_archived(self, today: date | None = None) -> bool:
        limit = self.retention_end()
        return limit is not None and (today or date.today()) > limit

    def delete_version(self, revision: str) -> None:
        self.versions = [v for v in self.versions if v.quote.revision != revision]

    # ---- 파일
    def to_dict(self) -> dict:
        return {"format": "kosmes-facility-quote", "version": 1, "case_id": self.case_id,
                "versions": [v.to_dict() for v in self.versions]}

    def save(self, path: str | None = None) -> str:
        path = path or self.path or os.path.join(store_dir(), f"{self.case_id}.json")
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=1)
        os.replace(tmp, path)
        self.path = path
        return path

    @classmethod
    def load(cls, path: str) -> "QuoteCase":
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        c = cls(case_id=d.get("case_id") or os.path.splitext(os.path.basename(path))[0],
                versions=[Version.from_dict(v) for v in d.get("versions", [])], path=path)
        return c


def normalize_biz(biz_no: str) -> str:
    """사업자번호 비교용: 숫자만 남긴다 (123-45-67890 == 1234567890)."""
    return "".join(ch for ch in (biz_no or "") if ch.isdigit())


@dataclass
class CaseSummary:
    path: str
    case_id: str
    company: str
    biz_no: str
    period: str
    end_date: date | None
    revisions: int
    latest_revision: str
    status: str
    total: int
    updated: str


def summarize(c: QuoteCase) -> CaseSummary:
    shown = c.final_version or c.latest
    q = shown.quote
    period = (f"{q.start_date:%Y.%m.%d} ~ {q.end_date:%Y.%m.%d}" if q.start_date and q.end_date else "-")
    status = f"최종({q.revision}차)" if c.final_version else "가견적"
    if c.is_archived():
        status += " · 보관"
    return CaseSummary(c.path or "", c.case_id, q.company, q.biz_no, period, q.end_date, len(c.versions),
                       c.latest.quote.revision, status, shown.grand_total, max(v.saved_at for v in c.versions))


def _iter_cases(directory: str):
    for name in os.listdir(directory):
        if not name.endswith(".json"):
            continue
        path = os.path.join(directory, name)
        try:
            c = QuoteCase.load(path)
        except (OSError, ValueError, KeyError, TypeError):
            continue
        if c.versions:
            yield c


def list_cases(directory: str | None = None) -> list[CaseSummary]:
    out = [summarize(c) for c in _iter_cases(directory or store_dir())]
    out.sort(key=lambda s: s.updated, reverse=True)
    return out


def cases_by_biz(biz_no: str, directory: str | None = None, exclude_case_id: str | None = None
                 ) -> list[CaseSummary]:
    """같은 사업자번호로 저장된 견적 건 (어느 차수든 사업자번호가 같으면 포함), 대관일 최신순."""
    key = normalize_biz(biz_no)
    if len(key) < 10:
        return []
    out = []
    for c in _iter_cases(directory or store_dir()):
        if c.case_id == exclude_case_id:
            continue
        if any(normalize_biz(v.quote.biz_no) == key for v in c.versions):
            out.append(summarize(c))
    out.sort(key=lambda s: (s.end_date or date.min, s.updated), reverse=True)
    return out


def prune_old_versions(directory: str | None = None, today: date | None = None) -> int:
    """대관종료일로부터 1개월이 지난 건은 최종 견적 1개만 남기고 나머지 차수를 삭제한다.

    최종 지정이 없는 건은 마지막 차수 1개만 남긴다 (기업 이력 조회용).
    삭제한 차수 수를 돌려준다.
    """
    today = today or date.today()
    removed = 0
    for c in _iter_cases(directory or store_dir()):
        if len(c.versions) <= 1:
            continue
        if not c.is_archived(today):
            continue
        keep = c.final_version or c.latest
        removed += len(c.versions) - 1
        c.versions = [keep]
        try:
            c.save()
        except OSError:
            continue
    return removed
