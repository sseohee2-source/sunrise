-- AlterTable
ALTER TABLE "Position" ADD COLUMN "termYears" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "personId" INTEGER NOT NULL,
    "positionId" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "retiredDate" TEXT,
    "isReappointment" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("createdAt", "endDate", "id", "isReappointment", "note", "personId", "positionId", "retiredDate", "startDate", "updatedAt") SELECT "createdAt", "endDate", "id", "isReappointment", "note", "personId", "positionId", "retiredDate", "startDate", "updatedAt" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
CREATE INDEX "Appointment_personId_idx" ON "Appointment"("personId");
CREATE INDEX "Appointment_positionId_idx" ON "Appointment"("positionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- 정관 제7조① 기본 임기: 이사장 3년, 이사·감사 2년, 당연직이사는 해당 직책 재임기간(비움)
UPDATE "Position" SET "termYears" = 3 WHERE "name" = '이사장';
UPDATE "Position" SET "termYears" = 2 WHERE "name" NOT IN ('이사장', '당연직이사');
