import { ComingSoon } from "@/components/common/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="이사회"
      stage={3}
      items={[
        "회차 목록 → 회차 상세 (기본정보 / 안건 / 출석 / 발언 / 수당 탭)",
        "출석·의결제외는 4단계, 수당 탭은 5단계",
      ]}
    />
  );
}
