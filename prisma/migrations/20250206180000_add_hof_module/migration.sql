-- CreateEnum
CREATE TYPE "HofProcedureType" AS ENUM ('TOXINA_BOTULINICA', 'PREENCHIMENTO_HA', 'BIOESTIMULADOR_COLAGENO', 'FIOS_PDO', 'SKINBOOSTER', 'OUTRO');

-- CreateEnum
CREATE TYPE "FacialRegion" AS ENUM ('TESTA', 'GLABELA', 'PERIORBICULAR', 'NARIZ', 'SULCO_NASOGENIANO', 'LABIO_SUPERIOR', 'LABIO_INFERIOR', 'MENTO', 'MANDIBULA', 'MALAR', 'TEMPORAL');

-- CreateEnum
CREATE TYPE "FitzpatrickType" AS ENUM ('I', 'II', 'III', 'IV', 'V', 'VI');

-- CreateTable
CREATE TABLE "HofAnamnesis" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "filled_by_id" TEXT,
    "allergy_anesthetics" BOOLEAN NOT NULL DEFAULT false,
    "allergy_ha" BOOLEAN NOT NULL DEFAULT false,
    "allergy_botulinum_toxin" BOOLEAN NOT NULL DEFAULT false,
    "allergy_other" TEXT,
    "uses_anticoagulants" BOOLEAN NOT NULL DEFAULT false,
    "uses_nsaids" BOOLEAN NOT NULL DEFAULT false,
    "medications_details" TEXT,
    "previous_procedures" TEXT,
    "autoimmune_diseases" BOOLEAN NOT NULL DEFAULT false,
    "autoimmune_details" TEXT,
    "is_pregnant_lactating" BOOLEAN NOT NULL DEFAULT false,
    "keloid_history" BOOLEAN NOT NULL DEFAULT false,
    "fitzpatrick_type" "FitzpatrickType",
    "patient_expectations" TEXT,
    "reference_photos" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HofAnamnesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faceogram" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "created_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Faceogram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaceogramEntry" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "faceogram_id" TEXT NOT NULL,
    "session_id" TEXT,
    "facial_region" "FacialRegion" NOT NULL,
    "procedure_type" "HofProcedureType" NOT NULL,
    "product_name" TEXT,
    "product_lot" TEXT,
    "quantity" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "superseded_by" TEXT,
    "superseded_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceogramEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaceogramLegendItem" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "procedure_type" "HofProcedureType" NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceogramLegendItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HofSession" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "faceogram_id" TEXT,
    "dentist_id" TEXT,
    "session_date" DATE NOT NULL,
    "post_procedure_notes" TEXT,
    "follow_up_status" TEXT DEFAULT 'pending',
    "follow_up_date" DATE,
    "total_value" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'completed',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HofSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HofPhoto" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "session_id" TEXT,
    "photo_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "annotations" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HofPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HofPlanItem" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "session_id" TEXT,
    "facial_region" "FacialRegion" NOT NULL,
    "procedure_type" "HofProcedureType" NOT NULL,
    "product_name" TEXT,
    "quantity" TEXT,
    "estimated_value" DECIMAL(10,2),
    "actual_value" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HofPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HofConsent" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "template_content" TEXT NOT NULL,
    "signature_data" TEXT,
    "signed_at" TIMESTAMP(6),
    "pdf_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HofConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HofAnamnesis_patient_id_idx" ON "HofAnamnesis"("patient_id");

-- CreateIndex
CREATE INDEX "HofAnamnesis_clinic_id_idx" ON "HofAnamnesis"("clinic_id");

-- CreateIndex
CREATE INDEX "Faceogram_patient_id_idx" ON "Faceogram"("patient_id");

-- CreateIndex
CREATE INDEX "Faceogram_clinic_id_idx" ON "Faceogram"("clinic_id");

-- CreateIndex
CREATE INDEX "FaceogramEntry_faceogram_id_idx" ON "FaceogramEntry"("faceogram_id");

-- CreateIndex
CREATE INDEX "FaceogramEntry_session_id_idx" ON "FaceogramEntry"("session_id");

-- CreateIndex
CREATE INDEX "FaceogramEntry_facial_region_idx" ON "FaceogramEntry"("facial_region");

-- CreateIndex
CREATE INDEX "FaceogramEntry_faceogram_id_created_at_idx" ON "FaceogramEntry"("faceogram_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "FaceogramLegendItem_clinic_id_idx" ON "FaceogramLegendItem"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "FaceogramLegendItem_clinic_id_procedure_type_key" ON "FaceogramLegendItem"("clinic_id", "procedure_type");

-- CreateIndex
CREATE INDEX "HofSession_patient_id_idx" ON "HofSession"("patient_id");

-- CreateIndex
CREATE INDEX "HofSession_clinic_id_idx" ON "HofSession"("clinic_id");

-- CreateIndex
CREATE INDEX "HofSession_session_date_idx" ON "HofSession"("session_date");

-- CreateIndex
CREATE INDEX "HofSession_clinic_id_session_date_idx" ON "HofSession"("clinic_id", "session_date");

-- CreateIndex
CREATE INDEX "HofPhoto_patient_id_idx" ON "HofPhoto"("patient_id");

-- CreateIndex
CREATE INDEX "HofPhoto_session_id_idx" ON "HofPhoto"("session_id");

-- CreateIndex
CREATE INDEX "HofPhoto_photo_type_idx" ON "HofPhoto"("photo_type");

-- CreateIndex
CREATE INDEX "HofPlanItem_patient_id_idx" ON "HofPlanItem"("patient_id");

-- CreateIndex
CREATE INDEX "HofPlanItem_clinic_id_idx" ON "HofPlanItem"("clinic_id");

-- CreateIndex
CREATE INDEX "HofPlanItem_status_idx" ON "HofPlanItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HofConsent_session_id_key" ON "HofConsent"("session_id");

-- CreateIndex
CREATE INDEX "HofConsent_patient_id_idx" ON "HofConsent"("patient_id");

-- CreateIndex
CREATE INDEX "HofConsent_clinic_id_idx" ON "HofConsent"("clinic_id");

-- CreateIndex
CREATE INDEX "HofConsent_status_idx" ON "HofConsent"("status");

-- AddForeignKey
ALTER TABLE "HofAnamnesis" ADD CONSTRAINT "HofAnamnesis_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faceogram" ADD CONSTRAINT "Faceogram_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceogramEntry" ADD CONSTRAINT "FaceogramEntry_faceogram_id_fkey" FOREIGN KEY ("faceogram_id") REFERENCES "Faceogram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceogramEntry" ADD CONSTRAINT "FaceogramEntry_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "HofSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HofSession" ADD CONSTRAINT "HofSession_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HofSession" ADD CONSTRAINT "HofSession_faceogram_id_fkey" FOREIGN KEY ("faceogram_id") REFERENCES "Faceogram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HofPhoto" ADD CONSTRAINT "HofPhoto_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HofPhoto" ADD CONSTRAINT "HofPhoto_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "HofSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HofPlanItem" ADD CONSTRAINT "HofPlanItem_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HofPlanItem" ADD CONSTRAINT "HofPlanItem_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "HofSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HofConsent" ADD CONSTRAINT "HofConsent_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HofConsent" ADD CONSTRAINT "HofConsent_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "HofSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
