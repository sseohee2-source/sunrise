import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/date";
import { prisma } from "@/lib/db";
import { nextSessionNo } from "@/lib/queries/meetings";
import { MeetingForm } from "../_components/meeting-form";

export default async function NewMeetingPage() {
  const date = today();
  const year = Number(date.slice(0, 4));
  const [regions, sessionNo] = await Promise.all([
    prisma.region.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    nextSessionNo(year),
  ]);
  const head = regions.find((r) => r.isHeadOffice && r.isActive);
  return (
    <>
      <PageHeader title="이사회 회차 등록" />
      <Card>
        <CardContent>
          <MeetingForm
            regions={regions}
            initial={{
              year,
              sessionNo,
              date,
              method: "FACE",
              methodOther: "",
              regionId: head?.id ?? null,
              locationDetail: "",
              isHeadOffice: !!head,
              convocation: "CHAIR",
              requesterIds: [],
              status: "PLANNED",
              note: "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
