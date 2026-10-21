-- CreateTable
CREATE TABLE "Position" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 1,
    "countsAsMember" BOOLEAN NOT NULL DEFAULT true,
    "allowanceEligible" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "Department" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Region" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Committee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "AllowanceRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "effectiveFrom" TEXT NOT NULL,
    "monthlyFixed" INTEGER NOT NULL,
    "faceFee" INTEGER NOT NULL,
    "writtenFee" INTEGER NOT NULL,
    "annualLimit" INTEGER NOT NULL,
    "warningMargin" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Person" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "education" TEXT,
    "career" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "personId" INTEGER NOT NULL,
    "positionId" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "retiredDate" TEXT,
    "isReappointment" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "sessionNo" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "methodOther" TEXT,
    "regionId" INTEGER,
    "locationDetail" TEXT,
    "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
    "convocation" TEXT NOT NULL DEFAULT 'CHAIR',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Meeting_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConvocationRequester" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meetingId" INTEGER NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    CONSTRAINT "ConvocationRequester_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConvocationRequester_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agenda" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meetingId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "agendaNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" INTEGER,
    "presenter" TEXT,
    "contact" TEXT,
    "result" TEXT,
    "amendment" TEXT,
    "description" TEXT,
    "keywords" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Agenda_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Agenda_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meetingId" INTEGER NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "isMember" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "absenceReason" TEXT,
    "note" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Attendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attendance_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgendaRecusal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "agendaId" INTEGER NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "reason" TEXT,
    CONSTRAINT "AgendaRecusal_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "Agenda" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgendaRecusal_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Remark" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meetingId" INTEGER NOT NULL,
    "agendaId" INTEGER,
    "personId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT,
    "actionDepartmentId" INTEGER,
    "actionPlan" TEXT,
    "actionResult" TEXT,
    "actionStatus" TEXT NOT NULL DEFAULT 'NEEDED',
    "actionDoneDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Remark_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Remark_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "Agenda" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Remark_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Remark_actionDepartmentId_fkey" FOREIGN KEY ("actionDepartmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AllowancePayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "personId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "meetingId" INTEGER,
    "month" INTEGER,
    "recMeetingDate" TEXT,
    "recMethod" TEXT,
    "rateId" INTEGER,
    "amount" INTEGER NOT NULL,
    "calcNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "paidDate" TEXT,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AllowancePayment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AllowancePayment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AllowancePayment_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "AllowanceRate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommitteeAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "committeeId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "note" TEXT,
    CONSTRAINT "CommitteeAssignment_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommitteeAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommitteeMeeting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "committeeId" INTEGER NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "regionId" INTEGER,
    "locationDetail" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommitteeMeeting_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommitteeMeeting_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommitteeMeeting_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommitteeAgenda" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "committeeMeetingId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "departmentId" INTEGER,
    "presenter" TEXT,
    "contact" TEXT,
    "note" TEXT,
    "boardAgendaId" INTEGER,
    CONSTRAINT "CommitteeAgenda_committeeMeetingId_fkey" FOREIGN KEY ("committeeMeetingId") REFERENCES "CommitteeMeeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommitteeAgenda_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommitteeAgenda_boardAgendaId_fkey" FOREIGN KEY ("boardAgendaId") REFERENCES "Agenda" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommitteeAttendance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "committeeMeetingId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "absenceReason" TEXT,
    CONSTRAINT "CommitteeAttendance_committeeMeetingId_fkey" FOREIGN KEY ("committeeMeetingId") REFERENCES "CommitteeMeeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommitteeAttendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "label" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "before" TEXT,
    "after" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_name_key" ON "Position"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Committee_name_key" ON "Committee"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AllowanceRate_effectiveFrom_key" ON "AllowanceRate"("effectiveFrom");

-- CreateIndex
CREATE INDEX "Appointment_personId_idx" ON "Appointment"("personId");

-- CreateIndex
CREATE INDEX "Appointment_positionId_idx" ON "Appointment"("positionId");

-- CreateIndex
CREATE INDEX "Meeting_year_sessionNo_idx" ON "Meeting"("year", "sessionNo");

-- CreateIndex
CREATE INDEX "Meeting_date_idx" ON "Meeting"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ConvocationRequester_meetingId_appointmentId_key" ON "ConvocationRequester"("meetingId", "appointmentId");

-- CreateIndex
CREATE INDEX "Agenda_meetingId_idx" ON "Agenda"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_meetingId_appointmentId_key" ON "Attendance"("meetingId", "appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaRecusal_agendaId_appointmentId_key" ON "AgendaRecusal"("agendaId", "appointmentId");

-- CreateIndex
CREATE INDEX "Remark_personId_idx" ON "Remark"("personId");

-- CreateIndex
CREATE INDEX "Remark_meetingId_idx" ON "Remark"("meetingId");

-- CreateIndex
CREATE INDEX "AllowancePayment_personId_year_idx" ON "AllowancePayment"("personId", "year");

-- CreateIndex
CREATE INDEX "AllowancePayment_meetingId_idx" ON "AllowancePayment"("meetingId");

-- CreateIndex
CREATE INDEX "CommitteeAssignment_committeeId_idx" ON "CommitteeAssignment"("committeeId");

-- CreateIndex
CREATE INDEX "CommitteeAssignment_personId_idx" ON "CommitteeAssignment"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "CommitteeAttendance_committeeMeetingId_personId_key" ON "CommitteeAttendance"("committeeMeetingId", "personId");

-- CreateIndex
CREATE INDEX "ChangeLog_entity_entityId_idx" ON "ChangeLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "ChangeLog_changedAt_idx" ON "ChangeLog"("changedAt");
