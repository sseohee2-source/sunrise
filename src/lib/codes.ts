// DB에 저장하는 코드값과 화면 표시용 한글 라벨

export const POSITION_CATEGORY = { STANDING: "상임", NON_STANDING: "비상임" } as const;

export const MEETING_METHOD = { FACE: "대면", WRITTEN: "서면", OTHER: "기타" } as const;

export const CONVOCATION = {
  CHAIR: "의장 소집",
  MEMBER_REQUEST: "재적이사 1/3 이상 요구",
} as const;

export const MEETING_STATUS = { PLANNED: "예정", DONE: "완료" } as const;

export const AGENDA_TYPE = { DELIBERATION: "심의", REPORT: "보고" } as const;

export const AGENDA_RESULT = {
  ORIGINAL: "원안의결",
  AMENDED: "수정의결",
  REJECTED: "부결",
  DEFERRED: "보류",
  REPORTED: "보고완료",
} as const;

/** 구분별 선택 가능한 결과 */
export const RESULTS_BY_TYPE = {
  DELIBERATION: ["ORIGINAL", "AMENDED", "REJECTED", "DEFERRED"],
  REPORT: ["REPORTED"],
} as const;

export const ATTENDANCE_STATUS = { PRESENT: "출석", ABSENT: "불참" } as const;

export const ACTION_STATUS = {
  NEEDED: "조치 필요",
  IN_PROGRESS: "진행 중",
  DONE: "조치 완료",
  NA: "해당 없음",
} as const;

export const PAYMENT_KIND = {
  FIXED: "정액급여",
  BOARD: "이사회 회의수당",
  RECOMMEND: "임원추천위원회 회의수당",
  OTHER: "기타",
} as const;

export const PAYMENT_STATUS = { PLANNED: "지급예정", PAID: "지급완료" } as const;

/** 수당 관련 화면·출력물 공통 안내 문구 */
export const ALLOWANCE_NOTICE = "임원추천위원회 수당은 확인된 입력분만 반영된 참고 자료입니다.";

/** 안건 번호 표기: 심의 제1호 */
export function agendaLabel(type: string, no: number): string {
  return `${label(AGENDA_TYPE, type)} 제${no}호`;
}

/** 회차 표기: 2026년 제3회 */
export function sessionLabel(year: number, sessionNo: number): string {
  return `${year}년 제${sessionNo}회`;
}

/** 코드 → 라벨 (없으면 원래 값) */
export function label<T extends Record<string, string>>(map: T, code: string | null | undefined): string {
  if (!code) return "";
  return (map as Record<string, string>)[code] ?? code;
}
