/**
 * 개발용 샘플 데이터
 * 실행: npm run db:seed (기존 데이터를 모두 지우고 다시 만듦)
 *
 * 인물·기관명은 모두 가상입니다. 다음 사례를 일부러 포함했습니다.
 * - 연임(부이사장, 비상임이사), 직책 변경(비상임이사 → 선임비상임이사), 중도 퇴임
 * - 임기 종료 후 후임 미선임으로 직무수행 중(기업금융이사), 현재 결원(지역혁신이사)
 * - 임기 만료 3개월 이내(감사), 수당 연간 한도 근접(황보석)
 * - 서면·기타(화상) 이사회, 재적이사 1/3 이상 요구 소집, 보수기준 안건 의결제외
 */
import { PrismaClient } from "@prisma/client";
import { isServingOn } from "../src/lib/domain/appointment";
import { fixedAllowance, meetingFee, rateOn } from "../src/lib/domain/allowance";
import { addDays, today } from "../src/lib/date";

const prisma = new PrismaClient();
const TODAY = today();

// 재현 가능한 난수
let seed = 20261021;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;

// ───────────── 마스터 ─────────────
const POSITIONS = [
  ["STANDING", "이사장", 1, true, false],
  ["STANDING", "부이사장", 1, true, false],
  ["STANDING", "기획관리이사", 1, true, false],
  ["STANDING", "기업금융이사", 1, true, false],
  ["STANDING", "글로벌성장이사", 1, true, false],
  ["STANDING", "인력성장이사", 1, true, false],
  ["STANDING", "지역혁신이사", 1, true, false],
  ["STANDING", "감사", 1, false, false],
  ["NON_STANDING", "선임비상임이사", 1, true, true],
  ["NON_STANDING", "비상임이사", 6, true, true],
  ["NON_STANDING", "노동이사", 1, true, false],
  ["NON_STANDING", "당연직이사", 1, true, false],
] as const;

const DEPARTMENTS = [
  "기획조정실", "경영지원실", "기업금융처", "글로벌사업처", "인재육성처",
  "지역혁신처", "디지털전략처", "감사실", "ESG경영팀", "안전관리팀",
];

const REGIONS: [string, boolean][] = [["진주", true], ["서울", false], ["부산", false], ["대전", false]];

// ───────────── 인물·재임 ─────────────
type P = { name: string; edu: string; career: string };
const EDU = [
  "한국대학교 경영학 학사\n한국대학교 대학원 경영학 석사",
  "민국대학교 경제학 학사\n미국 ○○주립대 경제학 박사",
  "한빛대학교 법학 학사\n한빛대학교 대학원 법학 석사",
  "동방대학교 행정학 학사\n동방대학교 행정대학원 정책학 석사",
  "새솔대학교 산업공학 학사\n새솔대학교 대학원 기술경영 박사",
  "한국대학교 회계학 학사",
  "가람대학교 무역학 학사\n가람대학교 대학원 국제통상 석사",
];
const CAREER = [
  "前 ○○중소기업연구원 선임연구위원\n前 대통령직속 ○○위원회 위원",
  "前 ○○은행 부행장\n前 ○○신용보증기금 상임이사",
  "現 ○○법무법인 변호사\n前 ○○지방법원 판사",
  "前 중소벤처기업부 ○○정책관\n前 ○○지방청장",
  "現 ○○대학교 경영학과 교수\n前 한국○○학회 회장",
  "前 ○○회계법인 파트너\n前 ○○공사 비상임감사",
  "前 ○○무역진흥기관 본부장\n前 ○○협회 상근부회장",
  "現 ○○노동조합 위원장\n前 ○○ 노사협의회 근로자위원",
];

type ApptSeed = {
  person: string;
  position: string;
  start: string;
  end: string;
  retired?: string;
  re?: boolean;
  note?: string;
};

const APPTS: ApptSeed[] = [
  // 상임
  { person: "김정훈", position: "이사장", start: "2023-03-02", end: "2026-03-01", retired: "2026-03-01" },
  { person: "박상민", position: "이사장", start: "2026-03-02", end: "2029-03-01" },
  { person: "이도윤", position: "부이사장", start: "2023-07-01", end: "2025-06-30", retired: "2025-06-30" },
  { person: "이도윤", position: "부이사장", start: "2025-07-01", end: "2027-06-30", re: true },
  { person: "최수진", position: "기획관리이사", start: "2024-01-15", end: "2026-01-14", retired: "2026-01-14" },
  { person: "정해원", position: "기획관리이사", start: "2026-01-15", end: "2028-01-14" },
  { person: "윤재석", position: "기업금융이사", start: "2022-09-01", end: "2024-08-31", retired: "2024-08-31" },
  { person: "강민호", position: "기업금융이사", start: "2024-09-01", end: "2026-08-31", note: "후임 임명 시까지 직무수행" },
  { person: "송하늘", position: "글로벌성장이사", start: "2022-04-01", end: "2024-03-31", retired: "2024-03-31" },
  { person: "한지민", position: "글로벌성장이사", start: "2024-04-01", end: "2026-03-31", retired: "2026-03-31" },
  { person: "서진우", position: "글로벌성장이사", start: "2026-04-01", end: "2028-03-31" },
  { person: "임채원", position: "인력성장이사", start: "2023-05-15", end: "2025-05-14", retired: "2025-05-14" },
  { person: "조은비", position: "인력성장이사", start: "2025-05-15", end: "2027-05-14" },
  { person: "문성호", position: "지역혁신이사", start: "2023-06-01", end: "2025-05-31", retired: "2025-05-31" },
  { person: "문성호", position: "지역혁신이사", start: "2025-06-01", end: "2027-05-31", retired: "2026-06-30", re: true, note: "일신상 사유 중도 퇴임" },
  { person: "배경수", position: "감사", start: "2024-01-02", end: "2026-12-31" },
  // 비상임
  { person: "남궁현", position: "선임비상임이사", start: "2023-04-01", end: "2025-03-31", retired: "2025-03-31" },
  { person: "유지혜", position: "비상임이사", start: "2023-04-01", end: "2025-03-31", retired: "2025-03-31" },
  { person: "유지혜", position: "선임비상임이사", start: "2025-04-01", end: "2027-03-31", note: "비상임이사에서 선임비상임이사로 선임" },
  { person: "황보석", position: "비상임이사", start: "2023-04-01", end: "2025-03-31", retired: "2025-03-31" },
  { person: "황보석", position: "비상임이사", start: "2025-04-01", end: "2027-03-31", re: true },
  { person: "서윤아", position: "비상임이사", start: "2022-02-01", end: "2024-01-31", retired: "2024-01-31" },
  { person: "신미경", position: "비상임이사", start: "2024-02-01", end: "2026-01-31", retired: "2026-01-31" },
  { person: "고태현", position: "비상임이사", start: "2026-02-01", end: "2028-01-31" },
  { person: "전상우", position: "비상임이사", start: "2024-02-01", end: "2026-01-31", retired: "2026-01-31" },
  { person: "전상우", position: "비상임이사", start: "2026-02-01", end: "2028-01-31", re: true },
  { person: "류하은", position: "비상임이사", start: "2023-09-01", end: "2025-08-31", retired: "2025-08-31" },
  { person: "차민석", position: "비상임이사", start: "2025-09-01", end: "2027-08-31" },
  { person: "마동준", position: "비상임이사", start: "2022-06-01", end: "2024-05-31", retired: "2024-05-31" },
  { person: "권도영", position: "비상임이사", start: "2024-06-01", end: "2026-05-31", retired: "2025-11-30", note: "중도 퇴임" },
  { person: "노서연", position: "비상임이사", start: "2026-01-10", end: "2028-01-09" },
  { person: "양준혁", position: "비상임이사", start: "2025-04-01", end: "2027-03-31" },
  { person: "김노을", position: "노동이사", start: "2023-10-01", end: "2025-09-30", retired: "2025-09-30" },
  { person: "이한결", position: "노동이사", start: "2025-10-01", end: "2027-09-30" },
  { person: "장민재", position: "당연직이사", start: "2024-01-01", end: "2025-12-31", retired: "2025-08-15", note: "소속 부처 인사이동" },
  { person: "홍성빈", position: "당연직이사", start: "2025-08-16", end: "2027-08-15" },
];

// ───────────── 이사회 ─────────────
type MeetingSeed = { date: string; method: "FACE" | "WRITTEN" | "OTHER"; region?: string; detail?: string; other?: string; request?: boolean };
const M = (date: string, method: MeetingSeed["method"] = "FACE", region = "진주", detail = "본사 대회의실"): MeetingSeed =>
  method === "WRITTEN" ? { date, method } : { date, method, region, detail };

const MEETINGS: MeetingSeed[] = [
  // 2024
  M("2024-01-26"), M("2024-02-27", "WRITTEN"), M("2024-03-28"), M("2024-04-25", "FACE", "서울", "서울지역본부 회의실"),
  M("2024-05-30"), M("2024-06-27"), M("2024-07-25", "WRITTEN"), M("2024-09-26"),
  M("2024-10-31", "FACE", "서울", "○○빌딩 컨퍼런스룸"), M("2024-12-19"),
  // 2025
  M("2025-01-23"), M("2025-02-26", "WRITTEN"), M("2025-03-27"), M("2025-04-24"),
  { date: "2025-05-29", method: "OTHER", other: "화상회의", region: "진주", detail: "본사 영상회의실" },
  M("2025-06-26", "FACE", "부산", "부산지역본부 회의실"), M("2025-07-24", "WRITTEN"),
  { ...M("2025-08-28"), request: true }, M("2025-09-25"), M("2025-10-30", "FACE", "서울", "서울지역본부 회의실"), M("2025-12-18"),
  // 2026
  M("2026-01-29"), M("2026-02-25", "WRITTEN"), M("2026-03-26"), M("2026-04-29"),
  M("2026-05-28", "FACE", "대전", "대전 ○○컨벤션센터"), M("2026-06-25"), M("2026-07-23", "WRITTEN"), M("2026-09-24"),
  M("2026-11-26"), M("2026-12-17"),
];

const AGENDA_POOL: { title: string; dept: string; kw: string; type: "DELIBERATION" | "REPORT" }[] = [
  { title: "{y}년도 예산(안)", dept: "기획조정실", kw: "예산,재무", type: "DELIBERATION" },
  { title: "{y}년도 사업계획(안)", dept: "기획조정실", kw: "사업계획,경영목표", type: "DELIBERATION" },
  { title: "{p}년도 결산(안)", dept: "경영지원실", kw: "결산,재무제표", type: "DELIBERATION" },
  { title: "정관 일부 개정(안)", dept: "기획조정실", kw: "정관,규정", type: "DELIBERATION" },
  { title: "직제규정 일부 개정(안)", dept: "경영지원실", kw: "조직,직제", type: "DELIBERATION" },
  { title: "인사규정 일부 개정(안)", dept: "경영지원실", kw: "인사,규정", type: "DELIBERATION" },
  { title: "중장기 경영목표 수정(안)", dept: "기획조정실", kw: "경영목표,중장기", type: "DELIBERATION" },
  { title: "정책자금 융자 운용계획 변경(안)", dept: "기업금융처", kw: "정책자금,융자", type: "DELIBERATION" },
  { title: "해외진출 지원사업 운영지침 개정(안)", dept: "글로벌사업처", kw: "해외진출,수출", type: "DELIBERATION" },
  { title: "청년 인재양성 사업 추진계획(안)", dept: "인재육성처", kw: "청년,인재양성", type: "DELIBERATION" },
  { title: "지역균형발전 협력사업 추진(안)", dept: "지역혁신처", kw: "지역균형,협력", type: "DELIBERATION" },
  { title: "정보화 기본계획(안)", dept: "디지털전략처", kw: "디지털,정보화", type: "DELIBERATION" },
  { title: "자산 취득 및 처분(안)", dept: "경영지원실", kw: "자산,재무", type: "DELIBERATION" },
  { title: "ESG 경영 추진계획(안)", dept: "ESG경영팀", kw: "ESG,지속가능", type: "DELIBERATION" },
  { title: "안전경영책임계획(안)", dept: "안전관리팀", kw: "안전,중대재해", type: "DELIBERATION" },
  { title: "경영실적 평가 결과 보고", dept: "기획조정실", kw: "경영평가", type: "REPORT" },
  { title: "내부감사 결과 보고", dept: "감사실", kw: "감사,내부통제", type: "REPORT" },
  { title: "{q}분기 사업 추진실적 보고", dept: "기획조정실", kw: "사업실적", type: "REPORT" },
  { title: "정책자금 집행 현황 보고", dept: "기업금융처", kw: "정책자금,집행", type: "REPORT" },
  { title: "리스크관리 현황 보고", dept: "기업금융처", kw: "리스크,건전성", type: "REPORT" },
  { title: "이사회 지적사항 조치결과 보고", dept: "기획조정실", kw: "이사회,조치결과", type: "REPORT" },
  { title: "고객만족도 조사 결과 보고", dept: "ESG경영팀", kw: "고객만족", type: "REPORT" },
  { title: "청렴도 평가 결과 및 개선계획 보고", dept: "감사실", kw: "청렴,윤리경영", type: "REPORT" },
  { title: "개인정보 보호 실태 점검 결과 보고", dept: "디지털전략처", kw: "개인정보,보안", type: "REPORT" },
];

const REMARK_POOL = [
  ["사업 성과지표가 산출 중심으로 되어 있어 성과(결과) 중심 지표로 보완이 필요함", "성과지표,경영목표"],
  ["정책자금 연체율 추이를 분기별로 이사회에 보고해 주기 바람", "정책자금,리스크"],
  ["지역 간 지원 편차가 크므로 지역별 배분 기준을 재검토할 필요가 있음", "지역균형"],
  ["청년 인재양성 사업의 취업 연계 실적을 추적 관리해 주기 바람", "청년,인재양성"],
  ["예산 이월액이 반복적으로 발생하는 원인을 분석해 주기 바람", "예산,집행률"],
  ["해외 거점 운영 효율성 검토와 현지 기관 협업 방안 마련 필요", "해외진출"],
  ["정보보안 사고 대응 매뉴얼을 최신화하고 모의훈련 결과를 공유 바람", "보안,디지털"],
  ["ESG 공시 의무화에 대비한 데이터 관리 체계를 선제적으로 갖출 것", "ESG,공시"],
  ["안전 점검 결과 지적사항의 이행 여부를 다음 이사회에 보고 바람", "안전,중대재해"],
  ["규정 개정 시 신구조문 대비표에 개정 사유를 구체적으로 기재해 주기 바람", "규정"],
  ["고객 불만 유형별 개선 조치를 정리해 공유해 주기 바람", "고객만족"],
  ["내부감사 지적사항의 재발 방지 대책이 실효성 있게 운영되는지 점검 필요", "감사,내부통제"],
];

const STAFF = ["김지현 차장", "이준호 과장", "박소연 대리", "최민규 차장", "정다은 과장", "한승우 대리", "오혜린 차장", "윤태경 과장"];

async function main() {
  console.log("기존 데이터 삭제…");
  await prisma.$transaction([
    prisma.changeLog.deleteMany(),
    prisma.committeeAttendance.deleteMany(),
    prisma.committeeAgenda.deleteMany(),
    prisma.committeeMeeting.deleteMany(),
    prisma.committeeAssignment.deleteMany(),
    prisma.allowancePayment.deleteMany(),
    prisma.remark.deleteMany(),
    prisma.agendaRecusal.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.convocationRequester.deleteMany(),
    prisma.agenda.deleteMany(),
    prisma.meeting.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.person.deleteMany(),
    prisma.position.deleteMany(),
    prisma.department.deleteMany(),
    prisma.region.deleteMany(),
    prisma.committee.deleteMany(),
    prisma.allowanceRate.deleteMany(),
    prisma.appSetting.deleteMany(),
  ]);

  // 마스터
  const positions = new Map<string, { id: number; countsAsMember: boolean; allowanceEligible: boolean; category: string }>();
  for (const [i, [category, name, quota, countsAsMember, allowanceEligible]] of POSITIONS.entries()) {
    const p = await prisma.position.create({
      data: { category, name, quota, countsAsMember, allowanceEligible, sortOrder: (i + 1) * 10 },
    });
    positions.set(name, p);
  }
  const depts = new Map<string, number>();
  for (const [i, name] of DEPARTMENTS.entries()) {
    depts.set(name, (await prisma.department.create({ data: { name, sortOrder: (i + 1) * 10 } })).id);
  }
  const regions = new Map<string, number>();
  for (const [i, [name, isHeadOffice]] of REGIONS.entries()) {
    regions.set(name, (await prisma.region.create({ data: { name, isHeadOffice, sortOrder: (i + 1) * 10 } })).id);
  }
  const committees = new Map<string, number>();
  for (const [i, name] of ["기업혁신소위원회", "경영혁신소위원회"].entries()) {
    committees.set(name, (await prisma.committee.create({ data: { name, sortOrder: (i + 1) * 10 } })).id);
  }
  await prisma.allowanceRate.create({
    data: { effectiveFrom: "2021-01-01", monthlyFixed: 1_800_000, faceFee: 300_000, writtenFee: 100_000, annualLimit: 30_000_000, warningMargin: 0, note: "(샘플) 이전 기준" },
  });
  await prisma.allowanceRate.create({
    data: { effectiveFrom: "2024-01-01", monthlyFixed: 2_000_000, faceFee: 400_000, writtenFee: 150_000, annualLimit: 30_000_000, warningMargin: 0, note: "현행 기준" },
  });
  const rates = await prisma.allowanceRate.findMany();
  await prisma.appSetting.create({ data: { key: "allowance.proRata", value: "true" } });

  // 인물
  console.log("임원…");
  const personIds = new Map<string, number>();
  const people: P[] = [...new Set(APPTS.map((a) => a.person))].map((name, i) => ({
    name,
    edu: EDU[i % EDU.length],
    career: APPTS.find((a) => a.person === name)!.position === "노동이사" ? CAREER[7] : CAREER[i % 7],
  }));
  for (const p of people) {
    personIds.set(p.name, (await prisma.person.create({ data: { name: p.name, education: p.edu, career: p.career } })).id);
  }
  for (const a of APPTS) {
    await prisma.appointment.create({
      data: {
        personId: personIds.get(a.person)!,
        positionId: positions.get(a.position)!.id,
        startDate: a.start,
        endDate: a.end,
        retiredDate: a.retired ?? null,
        isReappointment: a.re ?? false,
        note: a.note ?? null,
      },
    });
  }
  const appts = await prisma.appointment.findMany({ include: { position: true, person: true } });
  const personName = new Map([...personIds].map(([n, id]) => [id, n]));

  // 이사회
  console.log("이사회·안건·출석·발언…");
  const sessionCounter = new Map<number, number>();
  for (const ms of MEETINGS) {
    const year = Number(ms.date.slice(0, 4));
    const sessionNo = (sessionCounter.get(year) ?? 0) + 1;
    sessionCounter.set(year, sessionNo);
    const done = ms.date < TODAY;
    const regionId = ms.region ? regions.get(ms.region)! : null;
    const meeting = await prisma.meeting.create({
      data: {
        year,
        sessionNo,
        date: ms.date,
        method: ms.method,
        methodOther: ms.other ?? null,
        regionId,
        locationDetail: ms.detail ?? null,
        isHeadOffice: ms.region === "진주",
        convocation: ms.request ? "MEMBER_REQUEST" : "CHAIR",
        status: done ? "DONE" : "PLANNED",
      },
    });

    // 출석 (재적이사 + 감사)
    const serving = appts.filter((a) => isServingOn(a, ms.date));
    const members = serving.filter((a) => a.position.countsAsMember);
    const auditors = serving.filter((a) => a.position.name === "감사");
    const presentIds = new Set<number>();
    for (const a of [...members, ...auditors]) {
      const absent = done && chance(0.08);
      if (!absent) presentIds.add(a.id);
      await prisma.attendance.create({
        data: {
          meetingId: meeting.id,
          appointmentId: a.id,
          isMember: a.position.countsAsMember,
          status: absent ? "ABSENT" : "PRESENT",
          absenceReason: absent ? pick(["해외 출장", "개인 일정", "건강상 사유", "소속 기관 공무"]) : null,
        },
      });
    }

    // 1/3 요구 소집: 비상임이사 6명 요구 (재적 16명의 1/3 이상)
    if (ms.request) {
      const req = members.filter((a) => a.position.category === "NON_STANDING").slice(0, 6);
      for (const a of req) await prisma.convocationRequester.create({ data: { meetingId: meeting.id, appointmentId: a.id } });
    }

    // 안건
    const q = Math.min(4, Math.max(1, Math.ceil(Number(ms.date.slice(5, 7)) / 3) - 1)) || 4;
    const fill = (t: string) => t.replace("{y}", String(year + 1)).replace("{p}", String(year - 1)).replace("{q}", String(q));
    const nDelib = ms.method === "WRITTEN" ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3);
    const nReport = ms.method === "WRITTEN" ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 2);
    const delibPool = AGENDA_POOL.filter((a) => a.type === "DELIBERATION");
    const reportPool = AGENDA_POOL.filter((a) => a.type === "REPORT");
    const chosen: (typeof AGENDA_POOL)[number][] = [];
    const used = new Set<string>();
    const draw = (pool: typeof AGENDA_POOL, n: number) => {
      for (let i = 0; i < n; i++) {
        let c = pick(pool);
        for (let k = 0; k < 10 && used.has(c.title); k++) c = pick(pool);
        used.add(c.title);
        chosen.push(c);
      }
    };
    draw(delibPool, nDelib);
    draw(reportPool, nReport);

    const agendaIds: number[] = [];
    let dNo = 0;
    let rNo = 0;
    const month = ms.date.slice(5, 7);
    // 3월 회의: 임원 보수기준 안건
    if (month === "03") {
      dNo++;
      const ag = await prisma.agenda.create({
        data: {
          meetingId: meeting.id,
          type: "DELIBERATION",
          agendaNo: dNo,
          title: `${year}년도 임원 보수기준 개정(안)`,
          departmentId: depts.get("경영지원실")!,
          presenter: "경영지원실장",
          contact: pick(STAFF),
          result: done ? "ORIGINAL" : null,
          keywords: "보수,임원,보수기준",
          isCompensation: true,
          description: "기관장 및 상임이사 기본연봉·성과연봉 기준 조정",
        },
      });
      agendaIds.push(ag.id);
      // 이해관계 임원(이사장·상임 재적이사)을 의결제외로 추가
      for (const a of members.filter((x) => x.position.category === "STANDING")) {
        await prisma.agendaRecusal.create({
          data: { agendaId: ag.id, appointmentId: a.id, reason: "본인 보수 관련 특별한 이해관계" },
        });
      }
    }
    for (const c of chosen) {
      const isDelib = c.type === "DELIBERATION";
      const no = isDelib ? ++dNo : ++rNo;
      let result: string | null = null;
      let amendment: string | null = null;
      if (done) {
        if (!isDelib) result = "REPORTED";
        else {
          const r = rand();
          result = r < 0.8 ? "ORIGINAL" : r < 0.94 ? "AMENDED" : r < 0.98 ? "DEFERRED" : "REJECTED";
          if (result === "AMENDED") amendment = pick(["시행일을 다음 달 1일로 조정", "지원 대상 범위에 소상공인 포함", "부칙에 경과규정 신설", "집행 한도를 10% 감액"]);
        }
      }
      const ag = await prisma.agenda.create({
        data: {
          meetingId: meeting.id,
          type: c.type,
          agendaNo: no,
          title: fill(c.title),
          departmentId: depts.get(c.dept)!,
          presenter: `${c.dept.replace(/(실|처|팀)$/, "$1")}장`,
          contact: pick(STAFF),
          result,
          amendment,
          keywords: c.kw,
          description: chance(0.4) ? `${fill(c.title)} 관련 주요 내용 및 추진 경과` : null,
        },
      });
      agendaIds.push(ag.id);
    }

    // 발언 (완료된 대면/기타 회의, 출석한 비상임 이사)
    if (done && ms.method !== "WRITTEN") {
      const speakers = members.filter((a) => a.position.category === "NON_STANDING" && presentIds.has(a.id));
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n && speakers.length; i++) {
        const sp = pick(speakers);
        const [content, kw] = pick(REMARK_POOL);
        const ageDays = (Date.parse(TODAY) - Date.parse(ms.date)) / 86400_000;
        const status = ageDays > 240 ? (chance(0.9) ? "DONE" : "NA") : ageDays > 90 ? pick(["DONE", "IN_PROGRESS", "DONE"]) : pick(["NEEDED", "IN_PROGRESS"]);
        const dept = pick(DEPARTMENTS);
        await prisma.remark.create({
          data: {
            meetingId: meeting.id,
            agendaId: chance(0.7) ? pick(agendaIds) : null,
            personId: sp.personId,
            content,
            keywords: kw,
            actionDepartmentId: status === "NA" ? null : depts.get(dept)!,
            actionPlan: status === "NA" ? null : "관련 현황 분석 후 개선방안 마련, 차기 이사회 보고",
            actionResult: status === "DONE" ? "개선방안 수립 및 이사회 보고 완료" : status === "IN_PROGRESS" ? "현황 분석 진행 중" : null,
            actionStatus: status,
            actionDoneDate: status === "DONE" ? addDays(ms.date, 30 + Math.floor(rand() * 60)) : null,
          },
        });
      }
    }
  }

  // 수당
  console.log("수당…");
  const eligible = appts.filter((a) => a.position.allowanceEligible);
  const eligiblePersons = [...new Set(eligible.map((a) => a.personId))];
  const [cy, cm] = TODAY.split("-").map(Number);
  for (const pid of eligiblePersons) {
    const ranges = eligible.filter((a) => a.personId === pid).map((a) => ({ start: a.startDate, end: a.retiredDate }));
    for (let y = 2024; y <= cy; y++) {
      for (let m = 1; m <= 12; m++) {
        if (y === cy && m > cm) break;
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        const rate = rateOn(rates, `${ym}-01`)!;
        const fa = fixedAllowance(rate, y, m, ranges, true);
        if (!fa) continue;
        const payDay = `${ym}-25`;
        await prisma.allowancePayment.create({
          data: {
            personId: pid,
            year: y,
            kind: "FIXED",
            month: m,
            rateId: rate.id,
            amount: fa.amount,
            calcNote: fa.days < fa.totalDays ? `일할 ${fa.days}/${fa.totalDays}일` : null,
            status: payDay < TODAY ? "PAID" : "PLANNED",
            paidDate: payDay < TODAY ? payDay : null,
            isAuto: true,
          },
        });
      }
    }
  }
  const doneMeetings = await prisma.meeting.findMany({
    where: { status: "DONE" },
    include: { attendances: { include: { appointment: { include: { position: true } } } } },
  });
  for (const mt of doneMeetings) {
    const rate = rateOn(rates, mt.date)!;
    const fee = meetingFee(rate, mt.method) ?? rate.faceFee;
    for (const at of mt.attendances) {
      if (at.status !== "PRESENT" || !at.appointment.position.allowanceEligible) continue;
      const payDay = addDays(mt.date, 5);
      await prisma.allowancePayment.create({
        data: {
          personId: at.appointment.personId,
          year: mt.year,
          kind: "BOARD",
          meetingId: mt.id,
          rateId: rate.id,
          amount: fee,
          calcNote: mt.method === "OTHER" ? `기타(${mt.methodOther}) — 대면 단가 적용` : null,
          status: payDay < TODAY ? "PAID" : "PLANNED",
          paidDate: payDay < TODAY ? payDay : null,
          isAuto: true,
        },
      });
    }
  }
  // 임원추천위원회 수당 (확인분만 입력)
  const rec: [string, string, "FACE" | "WRITTEN"][] = [
    ["유지혜", "2025-03-10", "FACE"], ["유지혜", "2025-03-24", "FACE"], ["황보석", "2025-03-10", "FACE"],
    ["양준혁", "2025-12-08", "WRITTEN"], ["유지혜", "2026-01-05", "FACE"], ["유지혜", "2026-01-19", "FACE"],
    ["황보석", "2026-01-05", "FACE"], ["황보석", "2026-01-19", "FACE"], ["황보석", "2026-03-03", "FACE"],
    ["황보석", "2026-03-17", "FACE"], ["황보석", "2026-07-06", "FACE"], ["황보석", "2026-07-20", "WRITTEN"],
    ["전상우", "2026-07-06", "FACE"],
  ];
  for (const [name, date, method] of rec) {
    const rate = rateOn(rates, date)!;
    await prisma.allowancePayment.create({
      data: {
        personId: personIds.get(name)!,
        year: Number(date.slice(0, 4)),
        kind: "RECOMMEND",
        recMeetingDate: date,
        recMethod: method,
        rateId: rate.id,
        amount: meetingFee(rate, method)!,
        status: "PAID",
        paidDate: addDays(date, 10),
        memo: "임원추천위원회 간사 확인(메일)",
      },
    });
  }
  await prisma.allowancePayment.create({
    data: {
      personId: personIds.get("황보석")!,
      year: 2026,
      kind: "OTHER",
      amount: 500_000,
      status: "PAID",
      paidDate: "2026-06-12",
      memo: "(샘플) 경영전략 워크숍 자문 수당",
    },
  });

  // 소위원회
  console.log("소위원회…");
  const assign: [string, string, string, string | null][] = [
    ["기업혁신소위원회", "유지혜", "2024-01-01", null],
    ["기업혁신소위원회", "황보석", "2024-01-01", "2025-12-31"],
    ["기업혁신소위원회", "전상우", "2024-03-01", null],
    ["기업혁신소위원회", "고태현", "2026-02-15", null],
    ["경영혁신소위원회", "류하은", "2024-01-01", "2025-08-31"],
    ["경영혁신소위원회", "신미경", "2024-03-01", "2026-01-31"],
    ["경영혁신소위원회", "권도영", "2024-07-01", "2025-11-30"],
    ["경영혁신소위원회", "양준혁", "2025-04-15", null],
    ["경영혁신소위원회", "차민석", "2025-09-15", null],
    ["경영혁신소위원회", "황보석", "2026-01-01", null],
    ["경영혁신소위원회", "노서연", "2026-02-01", null],
  ];
  for (const [c, p, s, e] of assign) {
    await prisma.committeeAssignment.create({
      data: { committeeId: committees.get(c)!, personId: personIds.get(p)!, startDate: s, endDate: e },
    });
  }
  const assignments = await prisma.committeeAssignment.findMany();
  const faceMeetings = await prisma.meeting.findMany({
    where: { method: { not: "WRITTEN" } },
    include: { agendas: { where: { type: "DELIBERATION" } } },
    orderBy: { date: "asc" },
  });
  for (const [i, mt] of faceMeetings.entries()) {
    const cname = i % 2 === 0 ? "기업혁신소위원회" : "경영혁신소위원회";
    const cid = committees.get(cname)!;
    const date = addDays(mt.date, -(1 + Math.floor(rand() * 5)));
    const cm = await prisma.committeeMeeting.create({
      data: { committeeId: cid, meetingId: mt.id, date, regionId: regions.get("진주")!, locationDetail: "본사 소회의실" },
    });
    for (const [k, ag] of mt.agendas.slice(0, 1 + Math.floor(rand() * 2)).entries()) {
      await prisma.committeeAgenda.create({
        data: {
          committeeMeetingId: cm.id,
          sortOrder: k + 1,
          title: ag.title,
          departmentId: ag.departmentId,
          presenter: ag.presenter,
          contact: ag.contact,
          boardAgendaId: ag.id,
          note: "이사회 상정 전 사전 심의",
        },
      });
    }
    const done = date < TODAY;
    for (const a of assignments.filter((x) => x.committeeId === cid && x.startDate <= date && (!x.endDate || date <= x.endDate))) {
      const absent = done && chance(0.1);
      await prisma.committeeAttendance.create({
        data: { committeeMeetingId: cm.id, personId: a.personId, status: absent ? "ABSENT" : "PRESENT", absenceReason: absent ? "개인 일정" : null },
      });
    }
  }

  // 변경이력 예시
  const sample = await prisma.allowancePayment.findFirst({ where: { kind: "BOARD" }, include: { meeting: true } });
  if (sample) {
    await prisma.changeLog.create({
      data: {
        entity: "AllowancePayment",
        entityId: sample.id,
        label: `${personName.get(sample.personId)} / ${sample.meeting?.year}년 제${sample.meeting?.sessionNo}회 이사회 회의수당`,
        action: "UPDATE",
        field: "메모",
        before: null,
        after: "(샘플) 계좌 변경으로 지급일 조정",
      },
    });
  }

  const counts = {
    인물: await prisma.person.count(),
    재임: await prisma.appointment.count(),
    이사회: await prisma.meeting.count(),
    안건: await prisma.agenda.count(),
    출석: await prisma.attendance.count(),
    의결제외: await prisma.agendaRecusal.count(),
    발언: await prisma.remark.count(),
    수당: await prisma.allowancePayment.count(),
    소위원회개최: await prisma.committeeMeeting.count(),
    소위원회안건: await prisma.committeeAgenda.count(),
  };
  console.log("완료:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
