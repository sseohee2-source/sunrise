import { ExcelDownloadButton } from "@/components/common/excel-download-button";
import { ComingSoon } from "@/components/common/coming-soon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ExportPage() {
  return (
    <>
      <ComingSoon
        title="데이터 내보내기"
        stage={7}
        items={["연도·기간 지정, 항목 선택 후 하나의 엑셀 파일(항목별 시트 + 요약 시트)로 내보내기"]}
      />
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>공통 엑셀 모듈 시험 출력 (1단계 점검용)</CardTitle>
          <CardDescription>
            제목 행, 머리글 서식·틀 고정·자동 필터, 날짜·금액·백분율 형식, 합계 행(수식), 여러 줄 칸, 요약 시트를
            확인하기 위한 시험 파일입니다. 7단계에서 통합 내보내기 화면으로 바뀝니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExcelDownloadButton endpoint="/api/export/sample" label="시험 파일 다운로드" />
        </CardContent>
      </Card>
    </>
  );
}
