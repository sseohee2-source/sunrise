/** 서버 동작 결과 (저장은 되었지만 경고가 있으면 warnings 에 담음) */
export type ActionResult = { ok: true; warnings?: string[]; id?: number } | { ok: false; error: string };

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(v: unknown): v is string {
  return typeof v === "string" && DATE_RE.test(v);
}

/** 빈 문자열 → null */
export function nn(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** 검색 조건(주소창 값) 꺼내기 */
export type SearchParams = Record<string, string | string[] | undefined>;

export function sp(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
