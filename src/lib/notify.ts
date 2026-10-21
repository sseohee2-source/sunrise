"use client";

import { toast } from "sonner";

import type { ActionResult } from "@/lib/action-result";

/** 서버 동작 결과를 알림으로 표시. 성공이면 true */
export function notifyResult(r: ActionResult, successMessage = "저장했습니다."): boolean {
  if (!r.ok) {
    toast.error(r.error);
    return false;
  }
  if (r.warnings?.length) {
    toast.warning(`${successMessage} 다만 확인이 필요합니다.`, {
      description: r.warnings.join("\n"),
      duration: 10000,
    });
  } else {
    toast.success(successMessage);
  }
  return true;
}
