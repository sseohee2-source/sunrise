import { ComingSoon } from "@/components/common/coming-soon";

export default function Page() {
  return (
    <ComingSoon title="이사별 한도 현황" stage={5} items={["연간 한도 대비 소진율, 연말 예상액, 이사 × 월 현황표"]} />
  );
}
