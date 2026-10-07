"""연수원 시설대여 견적 프로그램 (PySide6)."""
from __future__ import annotations

import copy
import os
import sys
import tempfile
import traceback
from datetime import date, time, timedelta

from PySide6.QtCore import QDate, QLocale, Qt, QTime, QUrl
from PySide6.QtGui import QAction, QDesktopServices, QFont, QIcon, QImage, QKeySequence, QPixmap
from PySide6.QtWidgets import (QAbstractItemView, QApplication, QCheckBox, QComboBox, QDateEdit, QDialog,
                               QDialogButtonBox, QFileDialog, QFormLayout, QFrame, QGridLayout, QGroupBox,
                               QHBoxLayout, QHeaderView, QLabel, QLineEdit, QMainWindow, QMessageBox,
                               QPlainTextEdit, QPushButton, QScrollArea, QSpinBox, QTableWidget,
                               QTableWidgetItem, QTabWidget, QTimeEdit, QToolBar, QVBoxLayout, QWidget)

from . import __version__
from .model import (FACILITY_GROUPS, NO_DISCOUNT, VAT_RATE, DormUse, FacilityUse, Quote, RateBook, Room, Supplier,
                    billable_hours, calculate, digits, facility_fee, fmt_biz_no, live_biz_no, live_phone, won)
from .pdf_quote import build_quote_pdf, default_pdf_name, stamp_file
from .rates import (GROUP_FEES, SUPPLIER_LABELS, app_dir, discount_choices, is_family, load_or_create,
                    resource_path, save_book)
from .store import (RETENTION_MONTHS, QuoteCase, cases_by_biz, list_cases, normalize_biz,
                    prune_old_versions, store_dir)

APP_TITLE = "연수원 시설대여 견적"
RATE_CHOICES = ["0%", "50%", "100%"]


# ---------------------------------------------------------------- 변환 도우미
def qd(d: date | None) -> QDate:
    d = d or date.today()
    return QDate(d.year, d.month, d.day)


def pyd(q: QDate) -> date:
    return date(q.year(), q.month(), q.day())


def qt(t: time) -> QTime:
    return QTime(t.hour, t.minute)


def pyt(q: QTime) -> time:
    return time(q.hour(), q.minute())


def parse_rate(text: str) -> float:
    try:
        v = float(text.replace("%", "").strip() or 0)
    except ValueError:
        v = 0.0
    return max(0.0, min(100.0, v)) / 100


def rate_text(r: float) -> str:
    return f"{r * 100:g}%"


def money(v: int) -> str:
    return f"{v:,}"


def make_date_edit(d: date | None = None) -> QDateEdit:
    w = QDateEdit(qd(d))
    w.setCalendarPopup(True)
    w.setDisplayFormat("yyyy-MM-dd (ddd)")
    return w


def make_time_edit(t: time) -> QTimeEdit:
    w = QTimeEdit(qt(t))
    w.setDisplayFormat("HH:mm")
    return w


def ro_item(text: str = "", align=Qt.AlignRight | Qt.AlignVCenter) -> QTableWidgetItem:
    it = QTableWidgetItem(text)
    it.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)
    it.setTextAlignment(align)
    return it


def number_input(edit: QLineEdit, formatter):
    """숫자만 입력받고, 입력하는 동안 하이픈을 자동으로 넣어 보여준다 (저장은 숫자만)."""
    edit.setMaxLength(16)

    def reformat(text):
        n_before = len(digits(text[:edit.cursorPosition()]))   # 커서 앞 숫자 개수
        new = formatter(text)
        if new != text:
            edit.setText(new)
            pos, seen = len(new), 0
            for i, ch in enumerate(new):
                if seen == n_before:
                    pos = i
                    break
                if ch.isdigit():
                    seen += 1
            edit.setCursorPosition(pos)
    edit.textEdited.connect(reformat)


def fit_columns(table: QTableWidget, row: int):
    """입력 위젯(날짜·시간·객실 등) 글씨가 잘리지 않도록 열 너비를 위젯 크기 이상으로 넓힌다."""
    for c in range(table.columnCount()):
        w = table.cellWidget(row, c)
        if w is not None:
            need = w.sizeHint().width() + 6
            if table.columnWidth(c) < need:
                table.setColumnWidth(c, need)


# ---------------------------------------------------------------- 시설 사용 표
class FacilityTable(QTableWidget):
    COLS = ["이용일자", "이용호실", "건물", "층", "수용인원", "구분", "시작", "종료", "이용시간", "사용료",
            "부가세", "합계", "할인률", "할인금액"]
    C_DATE, C_ROOM, C_BLD, C_FLOOR, C_CAP, C_GROUP, C_START, C_END, C_HOURS, C_FEE, C_VAT, C_TOTAL, C_RATE, \
        C_DISC = range(14)

    def __init__(self, win: "MainWindow"):
        super().__init__(0, len(self.COLS))
        self.win = win
        self.setHorizontalHeaderLabels(self.COLS)
        self.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.verticalHeader().setDefaultSectionSize(30)
        h = self.horizontalHeader()
        h.setSectionResizeMode(QHeaderView.Interactive)
        for c, w in enumerate([150, 130, 70, 50, 70, 190, 90, 90, 70, 90, 80, 95, 85, 90]):
            self.setColumnWidth(c, w)
        self.setMinimumHeight(220)

    def room_combo(self, current: str = "") -> QComboBox:
        cb = QComboBox()
        cb.addItem("")
        names = [r.name for r in self.win.book.rentable_rooms()]
        cb.addItems(names)
        if current and current not in names:      # 대관불가로 바뀐 호실이 저장된 견적에 있을 때
            cb.addItem(current)
        cb.setCurrentText(current)
        cb.setMaxVisibleItems(25)
        cb.setSizeAdjustPolicy(QComboBox.AdjustToContents)
        return cb

    def add_row(self, u: FacilityUse | None = None):
        if u is None:
            prev = self.row_use(self.rowCount() - 1) if self.rowCount() else None
            u = FacilityUse(prev.use_date if prev else (self.win.default_date()), "",
                            prev.start if prev else time(9), prev.end if prev else time(18),
                            self.win.uniform_rate())
        r = self.rowCount()
        self.insertRow(r)
        de = make_date_edit(u.use_date)
        cb = self.room_combo(u.room)
        ts, te = make_time_edit(u.start), make_time_edit(u.end)
        rate = QComboBox()
        rate.setEditable(True)
        rate.addItems(RATE_CHOICES)
        rate.setCurrentText(rate_text(u.rate))
        self.setCellWidget(r, self.C_DATE, de)
        self.setCellWidget(r, self.C_ROOM, cb)
        self.setCellWidget(r, self.C_START, ts)
        self.setCellWidget(r, self.C_END, te)
        self.setCellWidget(r, self.C_RATE, rate)
        for c in (self.C_BLD, self.C_FLOOR, self.C_CAP, self.C_GROUP):
            self.setItem(r, c, ro_item("", Qt.AlignCenter))
        for c in (self.C_HOURS, self.C_FEE, self.C_VAT, self.C_TOTAL, self.C_DISC):
            self.setItem(r, c, ro_item())
        for w, sig in ((de, de.dateChanged), (cb, cb.currentTextChanged), (ts, ts.timeChanged),
                       (te, te.timeChanged), (rate, rate.currentTextChanged)):
            sig.connect(self.win.on_changed)
        self.apply_rate_mode(r)
        self.refresh_row(r)
        fit_columns(self, r)

    def row_use(self, r: int) -> FacilityUse:
        return FacilityUse(pyd(self.cellWidget(r, self.C_DATE).date()),
                           self.cellWidget(r, self.C_ROOM).currentText(),
                           pyt(self.cellWidget(r, self.C_START).time()),
                           pyt(self.cellWidget(r, self.C_END).time()),
                           parse_rate(self.cellWidget(r, self.C_RATE).currentText()))

    def uses(self) -> list[FacilityUse]:
        return [self.row_use(r) for r in range(self.rowCount()) if self.cellWidget(r, self.C_ROOM).currentText()]

    def refresh_row(self, r: int):
        u = self.row_use(r)
        room: Room | None = self.win.book.room(u.room)
        self.item(r, self.C_BLD).setText(room.building if room else "")
        self.item(r, self.C_FLOOR).setText(room.floor if room else "")
        self.item(r, self.C_CAP).setText(room.capacity if room else "")
        self.item(r, self.C_GROUP).setText(room.group if room else "")
        tip = f"비고: {room.note}" if room and room.note else ""
        self.cellWidget(r, self.C_ROOM).setToolTip(tip)
        hours = billable_hours(u.start, u.end)
        fee = facility_fee(room, hours) if room else 0
        vat = won(fee * VAT_RATE)
        bad = bool(room) and hours <= 0
        self.item(r, self.C_HOURS).setText("시간오류" if bad else (str(hours) if room else ""))
        self.item(r, self.C_HOURS).setForeground(Qt.red if bad else Qt.black)
        self.item(r, self.C_FEE).setText(money(fee) if room else "")
        self.item(r, self.C_VAT).setText(money(vat) if room else "")
        self.item(r, self.C_TOTAL).setText(money(fee + vat) if room else "")
        self.item(r, self.C_DISC).setText(money(won((fee + vat) * u.rate)) if room and u.rate else "")

    def apply_rate_mode(self, r: int):
        cb: QComboBox = self.cellWidget(r, self.C_RATE)
        manual = self.win.family_mode()
        cb.setEnabled(manual)
        if not manual:
            cb.blockSignals(True)
            cb.setCurrentText(rate_text(self.win.uniform_rate()))
            cb.blockSignals(False)

    def refresh_all(self):
        for r in range(self.rowCount()):
            self.apply_rate_mode(r)
            self.refresh_row(r)


# ---------------------------------------------------------------- 기숙사 사용 표
class DormTable(QTableWidget):
    COLS = ["입실일", "퇴실일", "객실 구분", "숙박일수", "객실 수", "1박 단가", "사용료", "부가세", "합계", "할인률",
            "할인금액"]
    C_IN, C_OUT, C_TYPE, C_NIGHTS, C_COUNT, C_UNIT, C_FEE, C_VAT, C_TOTAL, C_RATE, C_DISC = range(11)

    def __init__(self, win: "MainWindow"):
        super().__init__(0, len(self.COLS))
        self.win = win
        self.setHorizontalHeaderLabels(self.COLS)
        self.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.verticalHeader().setDefaultSectionSize(30)
        for c, w in enumerate([150, 150, 200, 75, 90, 90, 95, 85, 100, 85, 90]):
            self.setColumnWidth(c, w)
        self.setMinimumHeight(150)

    def add_row(self, u: DormUse | None = None):
        if u is None:
            d = self.win.default_date()
            u = DormUse(d, d + timedelta(days=1), self.win.book.dorms[0].name if self.win.book.dorms else "", 1,
                        self.win.uniform_rate())
        r = self.rowCount()
        self.insertRow(r)
        di, do = make_date_edit(u.check_in), make_date_edit(u.check_out)
        cb = QComboBox()
        names = [d.name for d in self.win.book.dorms]
        cb.addItems(names)
        if u.dorm and u.dorm not in names:
            cb.addItem(u.dorm)
        cb.setCurrentText(u.dorm)
        cb.setSizeAdjustPolicy(QComboBox.AdjustToContents)
        sp = QSpinBox()
        sp.setRange(1, 999)
        sp.setValue(u.count)
        sp.setSuffix(" 실")
        rate = QComboBox()
        rate.setEditable(True)
        rate.addItems(RATE_CHOICES)
        rate.setCurrentText(rate_text(u.rate))
        for c, w in ((self.C_IN, di), (self.C_OUT, do), (self.C_TYPE, cb), (self.C_COUNT, sp),
                     (self.C_RATE, rate)):
            self.setCellWidget(r, c, w)
        for c in (self.C_NIGHTS, self.C_UNIT, self.C_FEE, self.C_VAT, self.C_TOTAL, self.C_DISC):
            self.setItem(r, c, ro_item())
        for sig in (di.dateChanged, do.dateChanged, cb.currentTextChanged, sp.valueChanged,
                    rate.currentTextChanged):
            sig.connect(self.win.on_changed)
        self.apply_rate_mode(r)
        self.refresh_row(r)
        fit_columns(self, r)

    def row_use(self, r: int) -> DormUse:
        return DormUse(pyd(self.cellWidget(r, self.C_IN).date()), pyd(self.cellWidget(r, self.C_OUT).date()),
                       self.cellWidget(r, self.C_TYPE).currentText(), self.cellWidget(r, self.C_COUNT).value(),
                       parse_rate(self.cellWidget(r, self.C_RATE).currentText()))

    def uses(self) -> list[DormUse]:
        return [self.row_use(r) for r in range(self.rowCount())]

    def refresh_row(self, r: int):
        u = self.row_use(r)
        dorm = self.win.book.dorm(u.dorm)
        nights = (u.check_out - u.check_in).days
        fee = dorm.fee * max(0, nights) * u.count if dorm else 0
        vat = won(fee * VAT_RATE)
        self.item(r, self.C_NIGHTS).setText(f"{nights}박" if nights > 0 else "날짜오류")
        self.item(r, self.C_NIGHTS).setForeground(Qt.black if nights > 0 else Qt.red)
        self.item(r, self.C_UNIT).setText(money(dorm.fee) if dorm else "")
        self.item(r, self.C_FEE).setText(money(fee))
        self.item(r, self.C_VAT).setText(money(vat))
        self.item(r, self.C_TOTAL).setText(money(fee + vat))
        self.item(r, self.C_DISC).setText(money(won((fee + vat) * u.rate)) if u.rate else "")

    def apply_rate_mode(self, r: int):
        cb: QComboBox = self.cellWidget(r, self.C_RATE)
        manual = self.win.family_mode()
        cb.setEnabled(manual)
        if not manual:
            cb.blockSignals(True)
            cb.setCurrentText(rate_text(self.win.uniform_rate()))
            cb.blockSignals(False)

    def refresh_all(self):
        for r in range(self.rowCount()):
            self.apply_rate_mode(r)
            self.refresh_row(r)


# ---------------------------------------------------------------- 여러 날 추가
class MultiDayDialog(QDialog):
    def __init__(self, win: "MainWindow"):
        super().__init__(win)
        self.setWindowTitle("여러 날 한 번에 추가")
        f = QFormLayout(self)
        self.room = QComboBox()
        self.room.addItems([r.name for r in win.book.rentable_rooms()])
        d = win.default_date()
        self.d1, self.d2 = make_date_edit(d), make_date_edit(max(d, pyd(win.end_date.date())))
        self.t1, self.t2 = make_time_edit(time(9)), make_time_edit(time(18))
        self.skip_weekend = QCheckBox("토·일요일 제외")
        f.addRow("이용호실", self.room)
        f.addRow("시작일", self.d1)
        f.addRow("종료일", self.d2)
        f.addRow("시작시간", self.t1)
        f.addRow("종료시간", self.t2)
        f.addRow("", self.skip_weekend)
        f.addRow(QLabel("※ 일자마다 한 줄씩 생성되며, 사용료는 일자별로 각각 계산됩니다."))
        bb = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        bb.accepted.connect(self.accept)
        bb.rejected.connect(self.reject)
        f.addRow(bb)

    def days(self) -> list[date]:
        a, b = pyd(self.d1.date()), pyd(self.d2.date())
        out = []
        while a <= b:
            if not (self.skip_weekend.isChecked() and a.weekday() >= 5):
                out.append(a)
            a += timedelta(days=1)
        return out


# ---------------------------------------------------------------- 견적 목록
class CaseListDialog(QDialog):
    COLS = ["회사명", "사업자번호", "대관기간", "상태", "차수", "총 견적액(최종/최신)", "최종 수정일"]

    def __init__(self, parent):
        super().__init__(parent)
        self.setWindowTitle("견적 목록")
        self.resize(1080, 560)
        self.selected_path: str | None = None
        v = QVBoxLayout(self)
        top = QHBoxLayout()
        self.search = QLineEdit()
        self.search.setPlaceholderText("회사명 또는 사업자번호로 검색")
        self.search.textChanged.connect(self.fill)
        top.addWidget(QLabel("검색"))
        top.addWidget(self.search)
        btn_folder = QPushButton("보관 폴더 열기")
        btn_folder.clicked.connect(lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(store_dir())))
        btn_other = QPushButton("다른 파일 열기...")
        btn_other.clicked.connect(self.open_other)
        top.addWidget(btn_folder)
        top.addWidget(btn_other)
        v.addLayout(top)
        self.table = case_table(self.COLS)
        self.table.doubleClicked.connect(self.accept_current)
        v.addWidget(self.table)
        v.addWidget(QLabel(f"※ 대관종료일로부터 {RETENTION_MONTHS}개월이 지난 견적은 최종 견적만 보관됩니다."))
        bb = QDialogButtonBox()
        bb.addButton("열기", QDialogButtonBox.AcceptRole)
        bb.addButton("닫기", QDialogButtonBox.RejectRole)
        bb.accepted.connect(self.accept_current)
        bb.rejected.connect(self.reject)
        v.addWidget(bb)
        self.cases = list_cases()
        self.shown = []
        self.fill()

    def fill(self):
        key = self.search.text().strip()
        kbiz = normalize_biz(key)
        self.shown = [c for c in self.cases
                      if key in (c.company or "") or (kbiz and kbiz in normalize_biz(c.biz_no))]
        fill_case_table(self.table, self.shown, with_company=True)

    def accept_current(self):
        r = self.table.currentRow()
        if r < 0:
            return
        self.selected_path = self.shown[r].path
        self.accept()

    def open_other(self):
        path, _ = QFileDialog.getOpenFileName(self, "견적 파일 열기", store_dir(), "견적 파일 (*.json)")
        if path:
            self.selected_path = path
            self.accept()


def case_table(cols) -> QTableWidget:
    t = QTableWidget(0, len(cols))
    t.setHorizontalHeaderLabels(cols)
    t.setSelectionBehavior(QAbstractItemView.SelectRows)
    t.setSelectionMode(QAbstractItemView.SingleSelection)
    t.setEditTriggers(QAbstractItemView.NoEditTriggers)
    t.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
    for c in range(1, len(cols)):
        t.setColumnWidth(c, 130 if c != 2 else 190)
    return t


def fill_case_table(t: QTableWidget, cases, with_company: bool):
    t.setRowCount(len(cases))
    for r, c in enumerate(cases):
        vals = ([c.company or "(회사명 없음)", fmt_biz_no(c.biz_no) or "-"] if with_company else [c.period, c.company or "-"])
        vals += ([c.period] if with_company else []) + [
            c.status, f"{c.latest_revision}차 (총 {c.revisions}건)", money(c.total), c.updated]
        for col, val in enumerate(vals):
            it = QTableWidgetItem(val)
            if val == money(c.total) and col >= 4:
                it.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            if val.startswith("최종"):
                it.setForeground(Qt.red)
            t.setItem(r, col, it)


class BizHistoryDialog(QDialog):
    """사업자번호 기준 이전 대관 견적 조회."""
    RESULT_OPEN, RESULT_COPY_INFO = 1, 2

    def __init__(self, parent: "MainWindow", biz_no: str, cases):
        super().__init__(parent)
        self.win = parent
        self.cases = cases
        self.selected_case: QuoteCase | None = None
        self.selected_rev: str | None = None
        self.setWindowTitle(f"이전 대관 견적 조회 — 사업자번호 {biz_no}")
        self.resize(1050, 640)
        v = QVBoxLayout(self)
        names = sorted({c.company for c in cases if c.company})
        v.addWidget(QLabel(f"<b>{', '.join(names) or '-'}</b> · 사업자번호 {biz_no} · 이전 견적 {len(cases)}건 "
                           f"(대관일 최신순)"))
        self.cases_t = case_table(["대관기간", "회사명", "상태", "차수", "총 견적액(최종/최신)", "최종 수정일"])
        fill_case_table(self.cases_t, cases, with_company=False)
        self.cases_t.itemSelectionChanged.connect(self.on_case)
        v.addWidget(self.cases_t, 3)
        v.addWidget(QLabel("선택한 견적의 차수"))
        self.vers_t = QTableWidget(0, 7)
        self.vers_t.setHorizontalHeaderLabels(["차수", "구분", "견적일자", "총 견적액", "최초 작성", "최종 수정일",
                                               "변경 메모"])
        self.vers_t.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.vers_t.setSelectionMode(QAbstractItemView.SingleSelection)
        self.vers_t.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.vers_t.horizontalHeader().setSectionResizeMode(6, QHeaderView.Stretch)
        for c, w in enumerate([60, 80, 110, 110, 130, 130]):
            self.vers_t.setColumnWidth(c, w)
        self.vers_t.doubleClicked.connect(self.show_pdf)
        v.addWidget(self.vers_t, 2)
        hb = QHBoxLayout()
        b = QPushButton("선택 차수 PDF로 보기")
        b.clicked.connect(self.show_pdf)
        hb.addWidget(b)
        b = QPushButton("이 견적 열기(수정)")
        b.clicked.connect(self.open_case)
        hb.addWidget(b)
        b = QPushButton("기업정보만 현재 견적에 가져오기")
        b.setToolTip("회사명·대표자·담당자·연락처·이메일을 현재 입력 중인 견적에 채웁니다.")
        b.clicked.connect(self.copy_info)
        hb.addWidget(b)
        hb.addStretch()
        b = QPushButton("닫기")
        b.clicked.connect(self.reject)
        hb.addWidget(b)
        v.addLayout(hb)
        if cases:
            self.cases_t.selectRow(0)

    def on_case(self):
        r = self.cases_t.currentRow()
        if r < 0:
            return
        self.selected_case = QuoteCase.load(self.cases[r].path)
        vers = list(reversed(self.selected_case.versions))
        self.vers_t.setRowCount(len(vers))
        for i, ver in enumerate(vers):
            q = ver.quote
            vals = [f"{q.revision}차", "최종" if q.final else "가견적", f"{q.quote_date:%Y-%m-%d}",
                    money(ver.grand_total), ver.created_at, ver.saved_at, q.memo]
            for c, val in enumerate(vals):
                it = QTableWidgetItem(val)
                if c == 3:
                    it.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
                if q.final:
                    it.setForeground(Qt.red)
                self.vers_t.setItem(i, c, it)
        final_row = next((i for i, ver in enumerate(vers) if ver.quote.final), 0)
        self.vers_t.selectRow(final_row)

    def _version(self):
        if not self.selected_case:
            return None
        r = self.vers_t.currentRow()
        vers = list(reversed(self.selected_case.versions))
        return vers[r] if 0 <= r < len(vers) else None

    def show_pdf(self):
        ver = self._version()
        if not ver:
            return
        out_dir = os.path.join(tempfile.gettempdir(), "연수원견적_미리보기")
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, default_pdf_name(ver.quote))
        try:
            build_quote_pdf(ver.quote, self.win.book, path)
        except PermissionError:
            QMessageBox.warning(self, "PDF", "같은 PDF가 이미 열려 있습니다. 닫고 다시 시도해 주세요.")
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(path))

    def open_case(self):
        if not self.selected_case:
            return
        ver = self._version()
        self.selected_rev = ver.quote.revision if ver else None
        self.done(self.RESULT_OPEN)

    def copy_info(self):
        if not self.selected_case:
            return
        self.done(self.RESULT_COPY_INFO)


# ---------------------------------------------------------------- 담당자·안내문 설정
class SupplierDialog(QDialog):
    """연수원 담당자 정보와 견적서 안내문 수정. 저장하면 이후 모든 견적서에 계속 적용된다."""
    GROUPS = [
        ("연수원 담당자 (견적서 '공급자' 칸)", [("manager", "담당자 (이름·직급)"), ("manager_email", "이메일"),
                                             ("office_tel", "사무실 전화"), ("fax", "FAX")]),
        ("견적서 안내문", [("cafeteria_note", "4. 구내식당 안내"), ("notice", "유의사항"),
                       ("footer_note", "하단 안내문")]),
        ("공급자 정보", [("name", "상호"), ("biz_no", "사업자번호"), ("ceo", "대표"), ("biz_type", "업태"),
                     ("biz_item", "종목"), ("address", "주소"), ("title", "견적명(부제목)")]),
        ("기타", [("family_guide", "패밀리기업 할인 안내 (입력 화면 표시용)")]),
    ]
    MULTILINE = {"cafeteria_note", "notice", "footer_note", "family_guide"}

    def __init__(self, parent, book: RateBook, path: str):
        super().__init__(parent)
        self.setWindowTitle("담당자·안내문 설정")
        self.resize(820, 760)
        self.book, self.path = copy.deepcopy(book), path
        outer = QVBoxLayout(self)
        outer.addWidget(QLabel("여기서 저장한 내용은 이후 출력하는 모든 견적서에 계속 적용됩니다. "
                               "(이미 발행한 PDF는 바뀌지 않음)"))
        body = QWidget()
        v = QVBoxLayout(body)
        self.edits = {}
        for title, items in self.GROUPS:
            g = QGroupBox(title)
            f = QFormLayout(g)
            for key, label in items:
                val = getattr(self.book.supplier, key)
                if key in self.MULTILINE:
                    e = QPlainTextEdit(val)
                    e.setFixedHeight(100 if key == "notice" else 62)
                else:
                    e = QLineEdit(val)
                self.edits[key] = e
                f.addRow(label, e)
            v.addWidget(g)
        v.insertWidget(1, self._stamp_box())
        hb = QHBoxLayout()
        reset = QPushButton("안내문 기본값으로 되돌리기")
        reset.clicked.connect(self.reset_notes)
        hb.addWidget(reset)
        hb.addStretch()
        v.addLayout(hb)
        sc = QScrollArea()
        sc.setWidgetResizable(True)
        sc.setWidget(body)
        outer.addWidget(sc)
        bb = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        bb.button(QDialogButtonBox.Save).setText("저장")
        bb.button(QDialogButtonBox.Cancel).setText("취소")
        bb.accepted.connect(self.save)
        bb.rejected.connect(self.reject)
        outer.addWidget(bb)

    # ---- 직인 (exe 옆 '직인.png' 로 저장, 저장소·프로그램에는 포함하지 않음)
    def _stamp_box(self) -> QGroupBox:
        g = QGroupBox("직인 (견적서 '(인)' 자리에 찍힘)")
        h = QHBoxLayout(g)
        self.stamp_preview = QLabel()
        self.stamp_preview.setFixedSize(96, 96)
        self.stamp_preview.setAlignment(Qt.AlignCenter)
        self.stamp_preview.setStyleSheet("border:1px dashed #9AA5B8;background:white;color:#777")
        h.addWidget(self.stamp_preview)
        col = QVBoxLayout()
        b = QPushButton("직인 이미지 등록...")
        b.clicked.connect(self.pick_stamp)
        col.addWidget(b)
        b = QPushButton("직인 삭제")
        b.clicked.connect(self.clear_stamp)
        col.addWidget(b)
        col.addWidget(QLabel("PNG·JPG 이미지. 배경이 투명한 PNG가 가장 깔끔합니다.\n이 PC(프로그램 폴더)에만 저장됩니다."))
        col.addStretch()
        h.addLayout(col, 1)
        self.stamp_action = None        # None=변경 없음, "delete", 또는 새 이미지(QImage)
        self._show_stamp(QImage(stamp_file()) if os.path.exists(stamp_file()) else None)
        return g

    def _show_stamp(self, img):
        if img is None or img.isNull():
            self.stamp_preview.setPixmap(QPixmap())
            self.stamp_preview.setText("직인 없음")
        else:
            self.stamp_preview.setPixmap(QPixmap.fromImage(img).scaled(92, 92, Qt.KeepAspectRatio,
                                                                         Qt.SmoothTransformation))

    def pick_stamp(self):
        path, _ = QFileDialog.getOpenFileName(self, "직인 이미지 선택", "", "이미지 (*.png *.jpg *.jpeg *.bmp)")
        if not path:
            return
        img = QImage(path)
        if img.isNull():
            QMessageBox.warning(self, "직인 등록", "이미지를 읽을 수 없습니다. PNG 또는 JPG 파일을 선택해 주세요.")
            return
        if max(img.width(), img.height()) > 600:
            img = img.scaled(600, 600, Qt.KeepAspectRatio, Qt.SmoothTransformation)
        self.stamp_action = img
        self._show_stamp(img)

    def clear_stamp(self):
        self.stamp_action = "delete"
        self._show_stamp(None)

    def _apply_stamp(self):
        path = stamp_file()
        if self.stamp_action == "delete":
            if os.path.exists(path):
                os.remove(path)
        elif isinstance(self.stamp_action, QImage):
            if not self.stamp_action.save(path, "PNG"):
                raise OSError("직인 이미지를 저장하지 못했습니다.")

    def reset_notes(self):
        d = Supplier()
        for key in ("cafeteria_note", "notice", "footer_note"):
            self.edits[key].setPlainText(getattr(d, key))

    def save(self):
        for key, e in self.edits.items():
            setattr(self.book.supplier, key, e.toPlainText() if isinstance(e, QPlainTextEdit) else e.text().strip())
        try:
            save_book(self.book, self.path)
            self._apply_stamp()
        except PermissionError:
            QMessageBox.warning(self, "저장 실패", "사용료기준.xlsx 파일이 엑셀에서 열려 있습니다. 닫고 다시 저장해 주세요.")
            return
        except OSError as e:
            QMessageBox.warning(self, "저장 실패", str(e))
            return
        self.accept()


# ---------------------------------------------------------------- 기준 관리
class RateBookDialog(QDialog):
    ROOM_COLS = ["호실", "건물명", "층", "수용인원", "형태", "규모(구분)", "기본(3시간)", "추가 1시간당", "대관가능", "비고"]

    def __init__(self, parent, book: RateBook, path: str):
        super().__init__(parent)
        self.setWindowTitle("시설·요금 기준 관리")
        self.resize(1150, 680)
        self.book, self.path = copy.deepcopy(book), path
        v = QVBoxLayout(self)
        v.addWidget(QLabel(f"기준 파일: {path}   (엑셀로 직접 수정해도 됩니다. 프로그램을 다시 열면 반영됩니다.)"))
        tabs = QTabWidget()
        v.addWidget(tabs)

        # 시설
        w = QWidget()
        lv = QVBoxLayout(w)
        self.rooms = QTableWidget(0, len(self.ROOM_COLS))
        self.rooms.setHorizontalHeaderLabels(self.ROOM_COLS)
        for c, wd in enumerate([110, 80, 60, 80, 80, 200, 95, 95, 70, 220]):
            self.rooms.setColumnWidth(c, wd)
        for r in self.book.rooms:
            self._add_room_row(r)
        lv.addWidget(self.rooms)
        hb = QHBoxLayout()
        b_add = QPushButton("시설 추가")
        b_add.clicked.connect(lambda: self._add_room_row(None))
        b_del = QPushButton("선택 시설 삭제")
        b_del.clicked.connect(lambda: self._del_rows(self.rooms))
        hb.addWidget(b_add)
        hb.addWidget(b_del)
        hb.addStretch()
        hb.addWidget(QLabel("※ '대관가능' 체크를 해제하면 견적 입력 목록에서 숨겨집니다. 규모를 바꾸면 규정 요금이 자동 입력됩니다."))
        lv.addLayout(hb)
        tabs.addTab(w, "시설")

        # 기숙사
        w = QWidget()
        lv = QVBoxLayout(w)
        self.dorms = QTableWidget(0, 2)
        self.dorms.setHorizontalHeaderLabels(["객실 구분", "1박 사용료"])
        self.dorms.setColumnWidth(0, 250)
        self.dorms.setColumnWidth(1, 120)
        for d in self.book.dorms:
            self._add_simple(self.dorms, [d.name, str(d.fee)])
        lv.addWidget(self.dorms)
        hb = QHBoxLayout()
        b = QPushButton("객실 구분 추가")
        b.clicked.connect(lambda: self._add_simple(self.dorms, ["", "0"]))
        hb.addWidget(b)
        b = QPushButton("선택 삭제")
        b.clicked.connect(lambda: self._del_rows(self.dorms))
        hb.addWidget(b)
        hb.addStretch()
        lv.addLayout(hb)
        tabs.addTab(w, "기숙사")

        # 할인
        w = QWidget()
        lv = QVBoxLayout(w)
        self.discs = QTableWidget(0, 3)
        self.discs.setHorizontalHeaderLabels(["대상", "구분", "할인률(%) — 비우면 담당자 직접 선택"])
        self.discs.setColumnWidth(0, 700)
        self.discs.setColumnWidth(1, 90)
        self.discs.setColumnWidth(2, 230)
        for d in self.book.discounts:
            self._add_simple(self.discs, [d.name, d.category, "" if d.rate is None else f"{d.rate * 100:g}"])
        lv.addWidget(self.discs)
        hb = QHBoxLayout()
        b = QPushButton("할인 기준 추가")
        b.clicked.connect(lambda: self._add_simple(self.discs, ["", "", ""]))
        hb.addWidget(b)
        b = QPushButton("선택 삭제")
        b.clicked.connect(lambda: self._del_rows(self.discs))
        hb.addWidget(b)
        hb.addStretch()
        lv.addLayout(hb)
        tabs.addTab(w, "할인기준")

        # 공급자정보
        w = QWidget()
        f = QFormLayout(w)
        self.sup_edits = {}
        for key, label in SUPPLIER_LABELS.items():
            val = getattr(self.book.supplier, key)
            if key in ("cafeteria_note", "footer_note", "notice", "family_guide"):
                e = QPlainTextEdit(val)
                e.setFixedHeight(80)
            else:
                e = QLineEdit(val)
            self.sup_edits[key] = e
            f.addRow(label, e)
        sc = QScrollArea()
        sc.setWidgetResizable(True)
        sc.setWidget(w)
        tabs.addTab(sc, "공급자·안내문")

        bb = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        bb.button(QDialogButtonBox.Save).setText("저장")
        bb.button(QDialogButtonBox.Cancel).setText("취소")
        bb.accepted.connect(self.save)
        bb.rejected.connect(self.reject)
        v.addWidget(bb)

    def _add_room_row(self, room: Room | None):
        t = self.rooms
        r = t.rowCount()
        t.insertRow(r)
        room = room or Room("", "", "", "", "강의실", FACILITY_GROUPS[0], *GROUP_FEES[FACILITY_GROUPS[0]])
        for c, val in enumerate([room.name, room.building, room.floor, room.capacity, room.kind]):
            t.setItem(r, c, QTableWidgetItem(val))
        g = QComboBox()
        g.addItems(FACILITY_GROUPS)
        if room.group not in FACILITY_GROUPS:
            g.addItem(room.group)
        g.setCurrentText(room.group)
        t.setCellWidget(r, 5, g)
        t.setItem(r, 6, QTableWidgetItem(str(room.base_fee)))
        t.setItem(r, 7, QTableWidgetItem(str(room.extra_fee)))
        chk = QTableWidgetItem()
        chk.setFlags(Qt.ItemIsEnabled | Qt.ItemIsUserCheckable | Qt.ItemIsSelectable)
        chk.setCheckState(Qt.Checked if room.available else Qt.Unchecked)
        t.setItem(r, 8, chk)
        t.setItem(r, 9, QTableWidgetItem(room.note))

        def on_group(text, row_item=t.item(r, 0)):
            row = row_item.row()
            if text in GROUP_FEES:
                t.item(row, 6).setText(str(GROUP_FEES[text][0]))
                t.item(row, 7).setText(str(GROUP_FEES[text][1]))
        g.currentTextChanged.connect(on_group)
        if room.name == "":
            t.scrollToBottom()
            t.setCurrentCell(r, 0)

    @staticmethod
    def _add_simple(t: QTableWidget, vals):
        r = t.rowCount()
        t.insertRow(r)
        for c, v in enumerate(vals):
            t.setItem(r, c, QTableWidgetItem(v))

    @staticmethod
    def _del_rows(t: QTableWidget):
        for r in sorted({i.row() for i in t.selectedIndexes()}, reverse=True):
            t.removeRow(r)

    @staticmethod
    def _txt(t, r, c):
        it = t.item(r, c)
        return it.text().strip() if it else ""

    @staticmethod
    def _int(s: str) -> int:
        try:
            return int(float(s.replace(",", "") or 0))
        except ValueError:
            raise ValueError(f"숫자가 아닙니다: {s}")

    def save(self):
        from .model import Discount, DormType
        try:
            rooms, seen = [], set()
            for r in range(self.rooms.rowCount()):
                name = self._txt(self.rooms, r, 0)
                if not name:
                    continue
                if name in seen:
                    raise ValueError(f"호실 이름이 중복됩니다: {name}")
                seen.add(name)
                rooms.append(Room(name, self._txt(self.rooms, r, 1), self._txt(self.rooms, r, 2),
                                  self._txt(self.rooms, r, 3), self._txt(self.rooms, r, 4),
                                  self.rooms.cellWidget(r, 5).currentText(),
                                  self._int(self._txt(self.rooms, r, 6)), self._int(self._txt(self.rooms, r, 7)),
                                  self.rooms.item(r, 8).checkState() == Qt.Checked, self._txt(self.rooms, r, 9)))
            dorms = [DormType(self._txt(self.dorms, r, 0), self._int(self._txt(self.dorms, r, 1)))
                     for r in range(self.dorms.rowCount()) if self._txt(self.dorms, r, 0)]
            discs = []
            for r in range(self.discs.rowCount()):
                name = self._txt(self.discs, r, 0)
                if not name:
                    continue
                rate = self._txt(self.discs, r, 2).replace("%", "")
                discs.append(Discount(name, self._txt(self.discs, r, 1), None if rate == "" else float(rate) / 100))
            sup = Supplier()
            for key, e in self.sup_edits.items():
                setattr(sup, key, e.toPlainText() if isinstance(e, QPlainTextEdit) else e.text())
            self.book = RateBook(rooms, dorms, discs, sup)
            save_book(self.book, self.path)
        except PermissionError:
            QMessageBox.warning(self, "저장 실패", "기준 엑셀 파일이 열려 있습니다. 엑셀을 닫고 다시 저장해 주세요.")
            return
        except ValueError as e:
            QMessageBox.warning(self, "입력 확인", str(e))
            return
        self.accept()


# ---------------------------------------------------------------- 메인 화면
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.book, self.book_path = load_or_create()
        self.case = QuoteCase()
        self.current_rev: str | None = None
        self.dirty = False
        self._loading = False
        self.resize(1360, 900)
        self._build_ui()
        self.new_quote(confirm=False)
        try:
            n = prune_old_versions()
        except OSError:
            n = 0
        if n:
            self.statusBar().showMessage(
                f"대관일로부터 {RETENTION_MONTHS}개월이 지난 견적의 이전 차수 {n}건을 정리했습니다 (최종 견적만 보관).", 10000)
        if not self.book.supplier.manager.strip():
            self.statusBar().showMessage("처음 사용 시 [담당자·안내문 설정]에서 연수원 담당자 정보와 직인 이미지를 등록해 주세요.")

    # ---- UI 구성
    def _build_ui(self):
        tb = QToolBar()
        tb.setMovable(False)
        tb.setToolButtonStyle(Qt.ToolButtonTextOnly)
        self.addToolBar(tb)

        def act(text, slot, shortcut=None):
            a = QAction(text, self)
            a.triggered.connect(slot)
            if shortcut:
                a.setShortcut(QKeySequence(shortcut))
            tb.addAction(a)
            return a
        act("새 견적", lambda: self.new_quote(), "Ctrl+N")
        act("견적 목록", self.open_list, "Ctrl+O")
        tb.addSeparator()
        act("저장(현재 차수)", lambda: self.save(as_new=False), "Ctrl+S")
        self.act_new_rev = act("새 차수로 저장", lambda: self.save(as_new=True), "Ctrl+Shift+S")
        tb.addSeparator()
        act("견적서 PDF", self.export_pdf, "Ctrl+P")
        tb.addSeparator()
        act("담당자·안내문 설정", self.edit_supplier)
        act("시설·요금 기준 관리", self.edit_book)

        body = QWidget()
        root = QVBoxLayout(body)

        # 버전 바
        vb = QFrame()
        vb.setObjectName("verbar")
        hl = QHBoxLayout(vb)
        hl.addWidget(QLabel("<b>견적 차수</b>"))
        self.rev_combo = QComboBox()
        self.rev_combo.setMinimumWidth(330)
        self.rev_combo.activated.connect(self.on_rev_selected)
        hl.addWidget(self.rev_combo)
        self.final_chk = QCheckBox("최종 견적")
        self.final_chk.setStyleSheet("QCheckBox{font-weight:bold;color:#C00000}")
        self.final_chk.toggled.connect(self.on_final_toggled)
        hl.addWidget(self.final_chk)
        hl.addWidget(QLabel("변경 메모"))
        self.memo = QLineEdit()
        self.memo.setPlaceholderText("예) 인원 증가로 301호 → 다목적강의실 변경 (견적서에는 표시되지 않음)")
        self.memo.textChanged.connect(self.on_changed)
        hl.addWidget(self.memo, 1)
        self.modified_label = QLabel()
        self.modified_label.setStyleSheet("color:#555")
        hl.addWidget(self.modified_label)
        self.status_badge = QLabel()
        hl.addWidget(self.status_badge)
        root.addWidget(vb)
        self.archive_banner = QLabel()
        self.archive_banner.setWordWrap(True)
        self.archive_banner.setStyleSheet("background:#FFF4E5;border:1px solid #E0A040;border-radius:4px;"
                                          "padding:5px;color:#7A4A00")
        self.archive_banner.hide()
        root.addWidget(self.archive_banner)

        # 예약정보
        g = QGroupBox("예약 정보")
        grid = QGridLayout(g)
        self.e_company, self.e_bizno, self.e_ceo = QLineEdit(), QLineEdit(), QLineEdit()
        self.e_contact, self.e_office, self.e_mobile, self.e_email = QLineEdit(), QLineEdit(), QLineEdit(), QLineEdit()
        for w, fmt, tip in ((self.e_bizno, live_biz_no, "숫자만 입력 (예: 1234567890)"),
                            (self.e_office, live_phone, "숫자만 입력 (예: 0212345678)"),
                            (self.e_mobile, live_phone, "숫자만 입력 (예: 01012345678)")):
            number_input(w, fmt)
            w.setPlaceholderText(tip)
        self.cafeteria = QComboBox()
        self.cafeteria.addItems(["O", "X"])
        self.start_date, self.end_date = make_date_edit(), make_date_edit()
        self.auto_period = QCheckBox("이용내역으로 자동")
        self.auto_period.setChecked(True)
        self.quote_date = make_date_edit()
        self.revision = QLabel()
        biz_box = QWidget()
        bl = QHBoxLayout(biz_box)
        bl.setContentsMargins(0, 0, 0, 0)
        bl.addWidget(self.e_bizno, 1)
        self.biz_hint = QLabel()
        self.biz_hint.setStyleSheet("color:#C00000;font-weight:bold")
        bl.addWidget(self.biz_hint)
        self.biz_btn = QPushButton("이전 견적 조회")
        self.biz_btn.clicked.connect(self.open_biz_history)
        bl.addWidget(self.biz_btn)
        fields = [
            (0, 0, "회사명", self.e_company), (1, 0, "사업자번호", biz_box), (2, 0, "대표자명", self.e_ceo),
            (3, 0, "식당이용여부", self.cafeteria),
            (0, 2, "담당자명", self.e_contact), (1, 2, "사무실", self.e_office), (2, 2, "핸드폰", self.e_mobile),
            (3, 2, "이메일", self.e_email),
            (0, 4, "대관시작일", self.start_date), (1, 4, "대관종료일", self.end_date),
            (2, 4, "견적일자", self.quote_date), (3, 4, "견적차수", self.revision),
        ]
        for r, c, label, w in fields:
            grid.addWidget(QLabel(label), r, c)
            grid.addWidget(w, r, c + 1)
        grid.addWidget(self.auto_period, 0, 6)
        grid.addWidget(QLabel("할인대상 검토"), 4, 0)
        self.discount = QComboBox()
        for d in discount_choices(self.book):
            self.discount.addItem(d.name)
        self.discount.setMinimumContentsLength(40)
        self.discount.setSizeAdjustPolicy(QComboBox.AdjustToMinimumContentsLengthWithIcon)
        grid.addWidget(self.discount, 4, 1, 1, 5)
        self.discount_info = QLabel()
        self.discount_info.setWordWrap(True)
        self.discount_info.setStyleSheet("color:#1F3864")
        grid.addWidget(self.discount_info, 5, 1, 1, 6)
        for c in (1, 3, 5):
            grid.setColumnStretch(c, 1)
        root.addWidget(g)

        for w in (self.e_company, self.e_bizno, self.e_ceo, self.e_contact, self.e_office, self.e_mobile,
                  self.e_email):
            w.textChanged.connect(self.on_changed)
        self.cafeteria.currentTextChanged.connect(self.on_changed)
        self.e_bizno.editingFinished.connect(self.check_biz_history)
        self.start_date.dateChanged.connect(self.on_changed)
        self.end_date.dateChanged.connect(self.on_changed)
        self.quote_date.dateChanged.connect(self.on_changed)
        self.auto_period.toggled.connect(self.on_changed)
        self.discount.currentTextChanged.connect(self.on_discount_changed)

        # 시설
        g = QGroupBox("시설 사용 내역  (1행 = 1일·1호실, 사용료는 일자별로 기본 3시간 + 초과 1시간당 추가)")
        lv = QVBoxLayout(g)
        self.fac = FacilityTable(self)
        lv.addWidget(self.fac)
        hb = QHBoxLayout()
        for text, slot in (("행 추가", lambda: self.fac.add_row()), ("여러 날 한 번에 추가", self.add_multi_day),
                           ("선택 행 복제(다음 날)", self.dup_fac_rows), ("선택 행 삭제", lambda: self.del_rows(self.fac))):
            b = QPushButton(text)
            b.clicked.connect(slot)
            hb.addWidget(b)
        hb.addStretch()
        lv.addLayout(hb)
        root.addWidget(g, 3)

        # 기숙사
        g = QGroupBox("기숙사 사용 내역")
        lv = QVBoxLayout(g)
        self.dorm = DormTable(self)
        lv.addWidget(self.dorm)
        hb = QHBoxLayout()
        for text, slot in (("행 추가", lambda: self.dorm.add_row()), ("선택 행 삭제", lambda: self.del_rows(self.dorm))):
            b = QPushButton(text)
            b.clicked.connect(slot)
            hb.addWidget(b)
        hb.addStretch()
        lv.addLayout(hb)
        root.addWidget(g, 2)

        # 합계
        sb = QFrame()
        sb.setObjectName("sumbar")
        hl = QHBoxLayout(sb)
        self.sum_labels = {}
        for key, label in (("A", "시설(A)"), ("B", "기숙사(B)"), ("C", "합계(C)"), ("D", "할인(D)")):
            lab = QLabel()
            self.sum_labels[key] = lab
            hl.addWidget(QLabel(label))
            hl.addWidget(lab)
            hl.addSpacing(18)
        hl.addStretch()
        self.total_title = QLabel("총 견적액(E)")
        self.total_title.setStyleSheet("font-size:15px;font-weight:bold")
        hl.addWidget(self.total_title)
        self.sum_labels["E"] = QLabel()
        self.sum_labels["E"].setStyleSheet("font-size:20px;font-weight:bold;color:#C00000")
        hl.addWidget(self.sum_labels["E"])
        root.addWidget(sb)

        sc = QScrollArea()
        sc.setWidgetResizable(True)
        sc.setWidget(body)
        self.setCentralWidget(sc)
        self.setStyleSheet("""
            QGroupBox{font-weight:bold;border:1px solid #9AA5B8;border-radius:4px;margin-top:10px;padding-top:6px}
            QGroupBox::title{subcontrol-origin:margin;left:8px;padding:0 4px;color:#1F3864}
            QHeaderView::section{background:#1F3864;color:white;padding:4px;border:0;border-right:1px solid #3d5a8a}
            #verbar{background:#EEF1F6;border:1px solid #9AA5B8;border-radius:4px}
            #sumbar{background:#F3F6FB;border:1px solid #1F3864;border-radius:4px}
            QToolBar QToolButton{padding:6px 10px;font-weight:bold}
        """)

    # ---- 상태 도우미
    def default_date(self) -> date:
        return pyd(self.start_date.date())

    def current_discount(self):
        return self.book.discount(self.discount.currentText())

    def family_mode(self) -> bool:
        return is_family(self.current_discount())

    def uniform_rate(self) -> float:
        d = self.current_discount()
        if d is None or d.rate is None:
            return 0.0
        return d.rate

    # ---- 폼 <-> 데이터
    def collect(self) -> Quote:
        return Quote(
            company=self.e_company.text().strip(), biz_no=digits(self.e_bizno.text()),
            ceo=self.e_ceo.text().strip(), cafeteria=self.cafeteria.currentText(),
            contact=self.e_contact.text().strip(), office=digits(self.e_office.text()),
            mobile=digits(self.e_mobile.text()), email=self.e_email.text().strip(),
            start_date=pyd(self.start_date.date()), end_date=pyd(self.end_date.date()),
            quote_date=pyd(self.quote_date.date()), revision=self.current_rev or self.case.next_revision(),
            final=self.final_chk.isChecked(), memo=self.memo.text().strip(),
            discount=self.discount.currentText(), facilities=self.fac.uses(), dorms=self.dorm.uses())

    def load_quote(self, q: Quote):
        self._loading = True
        try:
            self.e_company.setText(q.company)
            self.e_bizno.setText(live_biz_no(q.biz_no))
            self.e_ceo.setText(q.ceo)
            self.cafeteria.setCurrentText(q.cafeteria or "O")
            self.e_contact.setText(q.contact)
            self.e_office.setText(live_phone(q.office))
            self.e_mobile.setText(live_phone(q.mobile))
            self.e_email.setText(q.email)
            self.start_date.setDate(qd(q.start_date))
            self.end_date.setDate(qd(q.end_date))
            self.quote_date.setDate(qd(q.quote_date))
            if self.discount.findText(q.discount) < 0:
                self.discount.addItem(q.discount)
            self.discount.setCurrentText(q.discount or NO_DISCOUNT)
            self.final_chk.setChecked(q.final)
            self.memo.setText(q.memo)
            self.fac.setRowCount(0)
            for u in q.facilities:
                self.fac.add_row(u)
            self.dorm.setRowCount(0)
            for u in q.dorms:
                self.dorm.add_row(u)
            self.auto_period.setChecked(True if not q.start_date else self.auto_period.isChecked())
        finally:
            self._loading = False
        self.update_discount_info()
        self.recalc()
        self.check_biz_history()
        self.set_dirty(False)

    # ---- 이벤트
    def on_changed(self, *_):
        if self._loading:
            return
        sender = self.sender()
        for table in (self.fac, self.dorm):
            for r in range(table.rowCount()):
                if sender in [table.cellWidget(r, c) for c in range(table.columnCount())]:
                    table.refresh_row(r)
        self.recalc()
        self.set_dirty(True)

    def on_discount_changed(self, *_):
        if self._loading:
            return
        self.update_discount_info()
        self.fac.refresh_all()
        self.dorm.refresh_all()
        self.recalc()
        self.set_dirty(True)

    def update_discount_info(self):
        d = self.current_discount()
        if d is None:
            self.discount_info.setText("")
        elif is_family(d):
            self.discount_info.setText("▶ 패밀리기업 할인: 아래 표의 '할인률'을 행마다 직접 선택하세요.\n"
                                       + self.book.supplier.family_guide)
        else:
            self.discount_info.setText(f"▶ {d.category} — 모든 시설·기숙사 사용료에 {rate_text(d.rate or 0)} 일괄 적용")

    def on_final_toggled(self, checked: bool):
        if self._loading:
            return
        other = self.case.final_version
        if checked and other and other.quote.revision != self.current_rev:
            ans = QMessageBox.question(self, "최종 견적 변경",
                                       f"이미 {other.quote.revision}차가 최종으로 지정되어 있습니다.\n"
                                       f"저장하면 이 차수가 최종이 되고 {other.quote.revision}차는 가견적으로 바뀝니다. "
                                       "계속할까요?")
            if ans != QMessageBox.Yes:
                self.final_chk.blockSignals(True)
                self.final_chk.setChecked(False)
                self.final_chk.blockSignals(False)
                return
        self.recalc()
        self.set_dirty(True)

    def recalc(self):
        q = self.collect()
        if self.auto_period.isChecked():
            dates = [u.use_date for u in q.facilities] + [u.check_in for u in q.dorms] + \
                    [u.check_out for u in q.dorms]
            if dates:
                self._loading, was = True, self._loading
                self.start_date.setDate(qd(min(dates)))
                self.end_date.setDate(qd(max(dates)))
                self._loading = was
        res = calculate(q, self.book)
        self.sum_labels["A"].setText(money(res.facility_sum.total))
        self.sum_labels["B"].setText(money(res.dorm_sum.total))
        self.sum_labels["C"].setText(money(res.subtotal))
        self.sum_labels["D"].setText(("- " + money(res.discount)) if res.discount else "0")
        self.sum_labels["E"].setText("₩ " + money(res.grand_total))
        self.total_title.setText("최종 견적금액(E)" if self.final_chk.isChecked() else "총 견적액(E) · 가견적")
        self.status_badge.setText(
            "<span style='color:#C00000;font-weight:bold;border:1px solid #C00000'>&nbsp;최종&nbsp;</span>"
            if self.final_chk.isChecked() else
            "<span style='color:#555;font-weight:bold'>&nbsp;가견적&nbsp;</span>")

    def set_dirty(self, v: bool):
        self.dirty = v
        name = self.e_company.text().strip() or "새 견적"
        rev = f"{self.current_rev}차" if self.current_rev else "미저장"
        self.setWindowTitle(f"{'* ' if v else ''}{name} [{rev}] - {APP_TITLE} v{__version__}")

    def refresh_rev_combo(self):
        self.rev_combo.clear()
        for v in self.case.versions:
            q = v.quote
            tag = "★최종" if q.final else "가견적"
            memo = f" · {q.memo}" if q.memo else ""
            self.rev_combo.addItem(f"{q.revision}차 [{tag}] 수정 {v.saved_at}  ₩{v.grand_total:,}{memo}", q.revision)
        if not self.current_rev:
            self.rev_combo.addItem(f"{self.case.next_revision()}차 (작성 중 · 미저장)", None)
            self.rev_combo.setCurrentIndex(self.rev_combo.count() - 1)
        else:
            self.rev_combo.setCurrentIndex(max(0, self.rev_combo.findData(self.current_rev)))
        self.revision.setText(self.current_rev or f"{self.case.next_revision()} (미저장)")
        cur = self.case.version(self.current_rev) if self.current_rev else None
        self.modified_label.setText(f"최초 작성 {cur.created_at} · <b>최종 수정 {cur.saved_at}</b>" if cur else "")
        self.update_archive_state()

    def update_archive_state(self):
        """대관종료일 + 1개월이 지난 견적: 최종 견적만 보관, 수정은 가능하되 새 차수는 만들지 않음."""
        archived = self.case.is_archived()
        self.act_new_rev.setEnabled(not archived)
        has_final = self.case.final_version is not None
        self.final_chk.setEnabled(not (archived and has_final))
        if archived:
            limit = self.case.retention_end()
            self.archive_banner.setText(
                f"보관 견적 — 대관종료일 후 {RETENTION_MONTHS}개월({limit:%Y-%m-%d})이 지나 "
                f"{'최종 견적만' if has_final else '마지막 차수만'} 보관 중입니다. 수정은 가능하며, 저장하면 이 견적에 바로 "
                "반영되고 최종 수정일이 갱신됩니다.")
        self.archive_banner.setVisible(archived)

    # ---- 동작
    def confirm_discard(self) -> bool:
        if not self.dirty:
            return True
        ans = QMessageBox.question(self, "저장하지 않은 변경", "저장하지 않은 변경 내용이 있습니다. 저장할까요?",
                                   QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel)
        if ans == QMessageBox.Save:
            return self.save(as_new=False)
        return ans == QMessageBox.Discard

    def new_quote(self, confirm=True):
        if confirm and not self.confirm_discard():
            return
        self.case = QuoteCase()
        self.current_rev = None
        q = Quote()
        q.start_date = q.end_date = date.today()
        self.load_quote(q)
        self.refresh_rev_combo()
        self.set_dirty(False)

    def open_list(self):
        if not self.confirm_discard():
            return
        dlg = CaseListDialog(self)
        if dlg.exec() and dlg.selected_path:
            self.open_case(dlg.selected_path)

    def open_case(self, path: str, revision: str | None = None):
        try:
            case = QuoteCase.load(path)
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "열기 실패", f"견적 파일을 열 수 없습니다.\n{e}")
            return
        if not case.versions:
            QMessageBox.warning(self, "열기 실패", "저장된 차수가 없는 파일입니다.")
            return
        self.case = case
        v = (case.version(revision) if revision else None) or case.final_version or case.latest
        self.current_rev = v.quote.revision
        self.load_quote(copy.deepcopy(v.quote))
        self.refresh_rev_combo()
        self.set_dirty(False)

    def on_rev_selected(self, idx: int):
        rev = self.rev_combo.itemData(idx)
        if rev == self.current_rev:
            return
        if not self.confirm_discard():
            self.refresh_rev_combo()
            return
        v = self.case.version(rev) if rev else None
        if v:
            self.current_rev = rev
            self.load_quote(copy.deepcopy(v.quote))
        self.refresh_rev_combo()
        self.set_dirty(False)

    def validate(self, q: Quote) -> bool:
        problems = []
        if not q.company:
            problems.append("· 회사명을 입력해 주세요.")
        for i, u in enumerate(q.facilities, 1):
            if billable_hours(u.start, u.end) <= 0:
                problems.append(f"· 시설 {i}행({u.room}): 종료시간이 시작시간보다 빠릅니다.")
        for i, u in enumerate(q.dorms, 1):
            if (u.check_out - u.check_in).days <= 0:
                problems.append(f"· 기숙사 {i}행: 퇴실일이 입실일보다 늦어야 합니다.")
        if problems:
            QMessageBox.warning(self, "입력 확인", "\n".join(problems))
            return False
        return True

    def save(self, as_new: bool) -> bool:
        q = self.collect()
        if not self.validate(q):
            return False
        if as_new and (self.current_rev is None or self.case.is_archived()):
            as_new = False      # 첫 저장은 01차, 보관 견적은 현재(최종) 견적에 덮어쓰기
        if as_new:
            memo = self.memo.text().strip()
            if memo and self.case.version(self.current_rev) and self.case.version(self.current_rev).quote.memo == memo:
                q.memo = ""     # 이전 차수의 메모를 그대로 물려받지 않게
        v = self.case.save_version(q, self.book, as_new=as_new)
        try:
            self.case.save()
        except OSError as e:
            QMessageBox.critical(self, "저장 실패", f"저장할 수 없습니다.\n{e}")
            return False
        self.current_rev = v.quote.revision
        self._loading = True
        self.memo.setText(v.quote.memo)
        self._loading = False
        self.refresh_rev_combo()
        self.set_dirty(False)
        self.statusBar().showMessage(f"{v.quote.revision}차 저장 완료 ({'최종' if v.quote.final else '가견적'})", 5000)
        return True

    def export_pdf(self):
        if self.dirty or self.current_rev is None:
            box = QMessageBox(self)
            box.setWindowTitle("먼저 저장")
            box.setText("견적서를 만들기 전에 현재 내용을 저장합니다.\n(PDF와 저장된 차수가 항상 일치하도록)")
            b_cur = box.addButton("현재 차수에 저장", QMessageBox.AcceptRole)
            b_new = box.addButton("새 차수로 저장", QMessageBox.AcceptRole) if self.current_rev and not self.case.is_archived() else None
            box.addButton("취소", QMessageBox.RejectRole)
            box.exec()
            if box.clickedButton() is b_cur:
                if not self.save(as_new=False):
                    return
            elif b_new is not None and box.clickedButton() is b_new:
                if not self.save(as_new=True):
                    return
            else:
                return
        q = self.case.version(self.current_rev).quote
        out_dir = os.path.join(app_dir(), "견적서PDF")
        os.makedirs(out_dir, exist_ok=True)
        path, _ = QFileDialog.getSaveFileName(self, "견적서 PDF 저장", os.path.join(out_dir, default_pdf_name(q)),
                                              "PDF (*.pdf)")
        if not path:
            return
        try:
            build_quote_pdf(q, self.book, path)
        except PermissionError:
            QMessageBox.warning(self, "저장 실패", "같은 이름의 PDF가 열려 있습니다. 닫고 다시 시도해 주세요.")
            return
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "PDF 생성 실패", f"{e}\n\n{traceback.format_exc()}")
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(path))

    # ---- 사업자번호 기준 이전 견적
    def check_biz_history(self):
        cases = cases_by_biz(self.e_bizno.text(), exclude_case_id=self.case.case_id)
        self.biz_hint.setText(f"이전 견적 {len(cases)}건" if cases else "")
        self.biz_btn.setEnabled(len(normalize_biz(self.e_bizno.text())) >= 10)
        return cases

    def open_biz_history(self):
        biz = self.e_bizno.text().strip()
        if len(normalize_biz(biz)) < 10:
            QMessageBox.information(self, "이전 견적 조회", "사업자번호 10자리를 입력해 주세요.")
            return
        cases = cases_by_biz(biz, exclude_case_id=self.case.case_id)
        if not cases:
            QMessageBox.information(self, "이전 견적 조회", f"사업자번호 {biz}로 저장된 이전 견적이 없습니다.")
            return
        dlg = BizHistoryDialog(self, biz, cases)
        result = dlg.exec()
        if result == BizHistoryDialog.RESULT_OPEN:
            if self.confirm_discard():
                self.open_case(dlg.selected_case.path, dlg.selected_rev)
        elif result == BizHistoryDialog.RESULT_COPY_INFO:
            src = (dlg.selected_case.final_version or dlg.selected_case.latest).quote
            for w, val in ((self.e_company, src.company), (self.e_ceo, src.ceo), (self.e_contact, src.contact),
                           (self.e_office, live_phone(src.office)), (self.e_mobile, live_phone(src.mobile)),
                           (self.e_email, src.email)):
                if val:
                    w.setText(val)
            if src.biz_no:
                self.e_bizno.setText(live_biz_no(src.biz_no))
            self.statusBar().showMessage("이전 견적의 기업정보를 가져왔습니다.", 5000)

    def add_multi_day(self):
        dlg = MultiDayDialog(self)
        if not dlg.exec():
            return
        for d in dlg.days():
            self.fac.add_row(FacilityUse(d, dlg.room.currentText(), pyt(dlg.t1.time()), pyt(dlg.t2.time()),
                                         self.uniform_rate()))
        self.recalc()
        self.set_dirty(True)

    def dup_fac_rows(self):
        rows = sorted({i.row() for i in self.fac.selectedIndexes()})
        if not rows and self.fac.rowCount():
            rows = [self.fac.rowCount() - 1]
        for r in rows:
            u = self.fac.row_use(r)
            u.use_date += timedelta(days=1)
            self.fac.add_row(u)
        self.recalc()
        self.set_dirty(True)

    def del_rows(self, table: QTableWidget):
        rows = sorted({i.row() for i in table.selectedIndexes()}, reverse=True)
        if not rows:
            QMessageBox.information(self, "행 삭제", "삭제할 행을 먼저 선택하세요. (행 번호를 클릭)")
            return
        for r in rows:
            table.removeRow(r)
        self.recalc()
        self.set_dirty(True)

    def edit_supplier(self):
        dlg = SupplierDialog(self, self.book, self.book_path)
        if dlg.exec():
            self.book = dlg.book
            self.update_discount_info()
            self.statusBar().showMessage("담당자·안내문을 저장했습니다. 이후 출력하는 견적서에 반영됩니다.", 6000)

    def edit_book(self):
        dlg = RateBookDialog(self, self.book, self.book_path)
        if not dlg.exec():
            return
        q = self.collect()
        dirty = self.dirty
        self.book = dlg.book
        self._loading = True
        self.discount.clear()
        for d in discount_choices(self.book):
            self.discount.addItem(d.name)
        self._loading = False
        self.load_quote(q)
        self.set_dirty(dirty)
        self.statusBar().showMessage("기준을 저장했습니다. 이후 새로 계산되는 금액부터 반영됩니다.", 6000)

    def closeEvent(self, e):
        if self.confirm_discard():
            e.accept()
        else:
            e.ignore()


def main():
    QLocale.setDefault(QLocale(QLocale.Korean, QLocale.SouthKorea))
    app = QApplication(sys.argv)
    app.setApplicationName(APP_TITLE)
    app.setFont(QFont("맑은 고딕", 9))
    icon = resource_path("assets", "app.ico")
    if os.path.exists(icon):
        app.setWindowIcon(QIcon(icon))
    try:
        w = MainWindow()
    except Exception as e:  # noqa: BLE001
        QMessageBox.critical(None, "실행 오류", f"기준 파일을 읽는 중 오류가 발생했습니다.\n{e}\n\n{traceback.format_exc()}")
        return 1
    w.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
