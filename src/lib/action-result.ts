/** 서버 동작 결과 (저장은 되었지만 경고가 있으면 warnings 에 담음) */
export type ActionResult = { ok: true; warnings?: string[] } | { ok: false; error: string };

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(v: unknown): v is string {
  return typeof v === "string" && DATE_RE.test(v);
}

/** 빈 문자열 → null */
export function nn(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}
