-- AlterTable
ALTER TABLE "drawing_revisions" ADD COLUMN     "external_link" TEXT;

-- AlterTable
ALTER TABLE "drawings" ADD COLUMN     "area" TEXT,
ADD COLUMN     "discipline" TEXT,
ADD COLUMN     "drawing_type" TEXT;
