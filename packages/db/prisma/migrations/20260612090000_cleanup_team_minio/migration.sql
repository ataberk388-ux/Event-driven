-- Drop the unused Team feature (dead model: no UI/API/logic referenced it).

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_teamId_fkey";

-- DropIndex
DROP INDEX "projects_teamId_idx";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "teamId";

-- DropTable
DROP TABLE "teams";
