-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "content_type" TEXT,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "storage_key" TEXT;

