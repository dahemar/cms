-- AlterTable
ALTER TABLE "Post" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "postType" TEXT NOT NULL DEFAULT 'blog';
