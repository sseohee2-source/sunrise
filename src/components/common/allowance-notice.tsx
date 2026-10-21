import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ALLOWANCE_NOTICE } from "@/lib/codes";

/** 수당 관련 모든 화면에 표시하는 참고 안내 */
export function AllowanceNotice() {
  return (
    <Alert variant="warning" className="mb-4">
      <Info />
      <AlertDescription>
        {ALLOWANCE_NOTICE} 이 화면의 집계는 정확한 정산이 아니라 사무국이 파악한 범위의 집행액입니다.
      </AlertDescription>
    </Alert>
  );
}
