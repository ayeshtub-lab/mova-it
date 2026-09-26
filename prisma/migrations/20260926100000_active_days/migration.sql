-- CreateTable
CREATE TABLE "ActiveDay" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,

    CONSTRAINT "ActiveDay_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "ActiveDay_day_idx" ON "ActiveDay"("day");

-- AddForeignKey
ALTER TABLE "ActiveDay" ADD CONSTRAINT "ActiveDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

