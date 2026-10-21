import { Suspense } from "react";

import { ExcelDownloadButton } from "@/components/common/excel-download-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getSettingsData } from "@/lib/queries/settings";
import { PositionsTab } from "./_components/positions-tab";
import { RatesTab } from "./_components/rates-tab";
import { SettingsTabs } from "./_components/settings-tabs";
import { SimpleTab } from "./_components/simple-tab";

export default async function SettingsPage() {
  const d = await getSettingsData();
  return (
    <>
      <PageHeader
        title="설정"
        description="여기서 바꾼 값은 모든 화면과 출력물에 바로 반영됩니다. 기록이 연결된 항목은 삭제 대신 '사용 안 함'으로 바꾸세요."
        actions={<ExcelDownloadButton endpoint="/api/export/settings" />}
      />
      <Card>
        <CardContent>
          <Suspense>
            <SettingsTabs
              panels={{
                positions: <PositionsTab positions={d.positions.map((p) => ({ ...p, note: p.note ?? "" }))} />,
                rates: <RatesTab rates={d.rates} proRata={d.proRata} />,
                committees: (
                  <SimpleTab
                    kind="committee"
                    noun="소위원회"
                    items={d.committees}
                    description="소위원회 위원 배정·개최 화면에서 선택하는 목록입니다."
                  />
                ),
                departments: (
                  <SimpleTab
                    kind="department"
                    noun="부서"
                    items={d.departments}
                    description="안건 담당부서, 발언 조치부서에서 선택하는 목록입니다."
                  />
                ),
                regions: (
                  <SimpleTab
                    kind="region"
                    noun="지역"
                    items={d.regions}
                    headOffice
                    description="이사회·소위원회 개최 지역입니다. 상세 위치(본사, ○○빌딩 등)는 회차마다 직접 입력합니다."
                  />
                ),
              }}
            />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}
