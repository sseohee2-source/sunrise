"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Field } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CONVOCATION, MEETING_METHOD, MEETING_STATUS } from "@/lib/codes";
import { notifyResult } from "@/lib/notify";
import { membersOnDate, saveMeeting, suggestSessionNo, type MeetingInput } from "../actions";

type Region = { id: number; name: string; isHeadOffice: boolean; isActive: boolean };
type Member = { id: number; name: string; position: string };

export function MeetingForm({ initial, regions }: { initial: MeetingInput; regions: Region[] }) {
  const router = useRouter();
  const editing = !!initial.id;
  const [v, setV] = useState<MeetingInput>(initial);
  const [members, setMembers] = useState<Member[]>([]);
  // 사용자가 직접 고친 값은 자동 계산하지 않음
  const [yearTouched, setYearTouched] = useState(editing);
  const [sessionTouched, setSessionTouched] = useState(editing);
  const [headTouched, setHeadTouched] = useState(editing);
  const [pending, start] = useTransition();
  const set = (patch: Partial<MeetingInput>) => setV((prev) => ({ ...prev, ...patch }));

  // 개최일이 바뀌면 그날의 재적이사 명단을 불러옴
  useEffect(() => {
    let cancelled = false;
    membersOnDate(v.date).then((m) => !cancelled && setMembers(m));
    return () => {
      cancelled = true;
    };
  }, [v.date]);

  async function changeDate(date: string) {
    set({ date });
    if (!yearTouched && /^\d{4}/.test(date)) {
      const year = Number(date.slice(0, 4));
      set({ year });
      if (!sessionTouched) set({ sessionNo: await suggestSessionNo(year, initial.id) });
    }
  }

  function changeRegion(id: number | null) {
    const r = regions.find((x) => x.id === id);
    set({ regionId: id, ...(headTouched ? {} : { isHeadOffice: !!r?.isHeadOffice }) });
  }

  function changeMethod(method: string) {
    // 서면 이사회는 장소가 없음
    if (method === "WRITTEN") set({ method, regionId: null, locationDetail: "", isHeadOffice: false });
    else set({ method });
  }

  const memberIds = new Set(members.map((m) => m.id));
  const requesters = v.requesterIds.filter((id) => memberIds.has(id));
  const needed = Math.ceil(members.length / 3);
  const shortOfThird = v.convocation === "MEMBER_REQUEST" && requesters.length * 3 < members.length;

  function submit() {
    start(async () => {
      const r = await saveMeeting(v);
      if (notifyResult(r) && r.ok && !editing) router.push(`/meetings/${r.id}`);
    });
  }

  return (
    <div className="grid max-w-3xl gap-5">
      <section className="grid grid-cols-3 gap-3">
        <Field label="개최일" required>
          <Input type="date" value={v.date} onChange={(e) => changeDate(e.target.value)} />
        </Field>
        <Field label="연도" required>
          <Input
            type="number"
            value={v.year}
            onChange={(e) => {
              setYearTouched(true);
              set({ year: Number(e.target.value) });
            }}
          />
        </Field>
        <Field label="회차" required hint="연도별 제1회부터 자동으로 매깁니다. 직접 고칠 수 있습니다.">
          <div className="flex items-center gap-1.5 text-sm">
            제
            <Input
              type="number"
              min={1}
              value={v.sessionNo}
              onChange={(e) => {
                setSessionTouched(true);
                set({ sessionNo: Number(e.target.value) });
              }}
              className="w-20"
            />
            회
          </div>
        </Field>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Field label="개최 방법" required>
          <NativeSelect value={v.method} onChange={(e) => changeMethod(e.target.value)}>
            {Object.entries(MEETING_METHOD).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {v.method === "OTHER" && (
          <Field label="기타 방법" required>
            <Input
              value={v.methodOther}
              onChange={(e) => set({ methodOther: e.target.value })}
              placeholder="예: 화상회의"
            />
          </Field>
        )}
        <Field label="진행 상태" required>
          <NativeSelect value={v.status} onChange={(e) => set({ status: e.target.value })}>
            {Object.entries(MEETING_STATUS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </section>

      {v.method !== "WRITTEN" && (
        <section className="grid grid-cols-3 gap-3">
          <Field label="개최 지역">
            <NativeSelect
              value={v.regionId ?? ""}
              onChange={(e) => changeRegion(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">선택 안 함</option>
              {regions
                .filter((r) => r.isActive || r.id === v.regionId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="상세 위치">
            <Input
              value={v.locationDetail}
              onChange={(e) => set({ locationDetail: e.target.value })}
              placeholder="예: 본사 대회의실, ○○빌딩"
            />
          </Field>
          <Field label="진주 본사 개최" hint="본사 지역을 고르면 자동 체크됩니다.">
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={v.isHeadOffice}
                onCheckedChange={(c) => {
                  setHeadTouched(true);
                  set({ isHeadOffice: c === true });
                }}
              />
              진주 본사에서 개최
            </label>
          </Field>
        </section>
      )}

      <section className="grid gap-3">
        <Field label="소집 근거" required className="max-w-xs">
          <NativeSelect value={v.convocation} onChange={(e) => set({ convocation: e.target.value })}>
            {Object.entries(CONVOCATION).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {v.convocation === "MEMBER_REQUEST" && (
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">소집을 요구한 이사</span>
              <span className={shortOfThird ? "font-semibold text-red-600" : "text-muted-foreground"}>
                {requesters.length}명 선택 / 재적이사 {members.length}명의 1/3 = {needed}명 이상 필요
              </span>
            </div>
            {shortOfThird && (
              <p className="mb-2 flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="size-3.5" />
                재적이사 1/3에 못 미칩니다. 저장은 되지만 확인이 필요합니다.
              </p>
            )}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {members.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={v.requesterIds.includes(m.id)}
                    onCheckedChange={(c) =>
                      set({
                        requesterIds: c === true ? [...v.requesterIds, m.id] : v.requesterIds.filter((x) => x !== m.id),
                      })
                    }
                  />
                  {m.name} <span className="text-muted-foreground text-xs">{m.position}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      <Field label="비고">
        <Textarea rows={2} value={v.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>

      {!editing && (
        <p className="text-muted-foreground text-sm">
          저장하면 개최일 기준 재적이사(감사 포함) 명단이 출석 탭에 자동으로 만들어집니다.
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "저장 중…" : editing ? "변경 내용 저장" : "회차 등록"}
        </Button>
        {!editing && (
          <Button variant="outline" onClick={() => router.back()}>
            취소
          </Button>
        )}
      </div>
    </div>
  );
}
