# 연수원 시설대여 견적 프로그램

중소벤처기업연수원 「연수원 시설 및 장비 사용료」 기준으로 시설·기숙사 대여 견적을 계산하고,
견적서를 PDF로 발행하는 Windows 프로그램입니다. (기존 엑셀 견적 폼 대체)

- 사용 방법 : [docs/사용설명서.md](docs/사용설명서.md)
- exe 내려받기 : GitHub **Actions → "Windows exe 빌드"** 최근 실행 → Artifacts의 `연수원견적-windows`

## 개발
```
pip install -r requirements.txt pytest
python -m pytest -q tests     # 계산 테스트
python run.py                 # 프로그램 실행
```
| 파일 | 내용 |
|---|---|
| `quote_app/model.py` | 데이터 구조, 사용료 계산 |
| `quote_app/rates.py` | 사용료 기준(`사용료기준.xlsx`) 읽기/쓰기, 규정 기본값 |
| `quote_app/store.py` | 견적 건·차수(버전) 저장 |
| `quote_app/pdf_quote.py` | 견적서 PDF |
| `quote_app/main.py` | 화면(PySide6) |
