-- CreateEnum
CREATE TYPE "DentitionType" AS ENUM ('PERMANENT', 'DECIDUOUS', 'MIXED');

-- CreateEnum
CREATE TYPE "ToothSurface" AS ENUM ('WHOLE', 'M', 'D', 'OI', 'VB', 'LP');

-- CreateEnum
CREATE TYPE "OdontogramEntryType" AS ENUM ('FINDING', 'PROCEDURE', 'NOTE');

-- CreateEnum
CREATE TYPE "TreatmentPlanItemStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "google_id" TEXT,
    "avatar_url" TEXT,
    "phone" TEXT,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_method" TEXT,
    "totp_secret" TEXT,
    "reset_token" TEXT,
    "reset_token_expires" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "cep" VARCHAR(9),
    "z_api_instance" TEXT,
    "z_api_token" TEXT,
    "z_api_client_token" TEXT,
    "smtp_host" TEXT,
    "smtp_port" INTEGER DEFAULT 465,
    "smtp_user" TEXT,
    "smtp_pass" TEXT,
    "smtp_from" TEXT,
    "smtp_secure" BOOLEAN DEFAULT true,
    "plan" TEXT NOT NULL DEFAULT 'basic',
    "status" TEXT NOT NULL DEFAULT 'active',
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_policy" TEXT NOT NULL DEFAULT 'disabled',
    "slug" VARCHAR(100),
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "logo_display_mode" TEXT DEFAULT 'logo_name',
    "primary_color" TEXT DEFAULT '#0EA5E9',
    "secondary_color" TEXT DEFAULT '#10B981',
    "slogan" TEXT,
    "tagline" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "website" TEXT,
    "business_hours" JSONB,
    "latitude" TEXT,
    "longitude" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dentist" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cro" TEXT NOT NULL,
    "specialty" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "phone_hash" TEXT,
    "commission_rate" DECIMAL(5,2) DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "Dentist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "birth_date" DATE,
    "address" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "portal_token" TEXT DEFAULT (gen_random_uuid())::text,
    "portal_token_expires" TIMESTAMP(6),
    "last_visit" TIMESTAMP(6),
    "phone_hash" TEXT,
    "cpf_hash" TEXT,
    "email_hash" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "dentist_id" TEXT,
    "service_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(6),
    "confirmed_at" TIMESTAMP(6),
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder_1h_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "messages" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationLog" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "intent" TEXT,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "phone" TEXT NOT NULL,
    "phone_hash" TEXT,
    "message" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "message_id" TEXT,
    "raw_payload" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_values" TEXT,
    "new_values" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "price_monthly" DECIMAL(10,2) NOT NULL,
    "price_yearly" DECIMAL(10,2),
    "max_patients" INTEGER,
    "max_dentists" INTEGER,
    "max_appointments_month" INTEGER,
    "max_whatsapp_messages" INTEGER,
    "features" JSONB,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_messages_limit" INTEGER,
    "priority_support" BOOLEAN NOT NULL DEFAULT false,
    "custom_branding" BOOLEAN NOT NULL DEFAULT false,
    "api_access" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(6) NOT NULL,
    "current_period_end" TIMESTAMP(6) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(6),
    "trial_start" TIMESTAMP(6),
    "trial_end" TIMESTAMP(6),
    "payment_method" TEXT,
    "payment_gateway" TEXT,
    "external_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "number" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2),
    "tax" DECIMAL(10,2),
    "total" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "due_date" DATE NOT NULL,
    "paid_at" TIMESTAMP(6),
    "payment_method" TEXT,
    "payment_gateway" TEXT,
    "external_id" TEXT,
    "invoice_url" TEXT,
    "description" TEXT,
    "items" JSONB,
    "metadata" JSONB,
    "nfse_id" TEXT,
    "nfse_pdf_url" TEXT,
    "nfse_status" TEXT,
    "nfse_cancel_reason" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "invoice_id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gateway_payment_id" TEXT,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(6),
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "code" TEXT NOT NULL,
    "discount_percent" INTEGER NOT NULL,
    "discount_months" INTEGER NOT NULL DEFAULT 1,
    "max_uses" INTEGER,
    "current_uses" INTEGER NOT NULL DEFAULT 0,
    "valid_until" TIMESTAMP(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicAiSettings" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ai_provider" TEXT NOT NULL DEFAULT 'anthropic',
    "ai_api_key" TEXT,
    "ai_model" TEXT NOT NULL DEFAULT 'claude-3-5-haiku-20241022',
    "ai_temperature" DECIMAL(2,1) NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER NOT NULL DEFAULT 800,
    "assistant_name" TEXT NOT NULL DEFAULT 'Sofia',
    "assistant_personality" TEXT,
    "welcome_message" TEXT,
    "fallback_message" TEXT,
    "out_of_hours_message" TEXT,
    "transfer_keywords" TEXT[],
    "blocked_topics" TEXT[],
    "custom_instructions" TEXT,
    "context_messages" INTEGER NOT NULL DEFAULT 10,
    "auto_schedule" BOOLEAN NOT NULL DEFAULT false,
    "auto_confirm" BOOLEAN NOT NULL DEFAULT false,
    "auto_cancel" BOOLEAN NOT NULL DEFAULT false,
    "notify_on_transfer" BOOLEAN NOT NULL DEFAULT true,
    "working_hours_only" BOOLEAN NOT NULL DEFAULT false,
    "use_welcome_menu" BOOLEAN NOT NULL DEFAULT false,
    "use_confirmation_buttons" BOOLEAN NOT NULL DEFAULT false,
    "use_timeslot_list" BOOLEAN NOT NULL DEFAULT false,
    "use_satisfaction_poll" BOOLEAN NOT NULL DEFAULT false,
    "use_send_location" BOOLEAN NOT NULL DEFAULT false,
    "dentist_ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder_24h" BOOLEAN NOT NULL DEFAULT true,
    "reminder_1h" BOOLEAN NOT NULL DEFAULT true,
    "reminder_message_24h" TEXT,
    "reminder_message_1h" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicAiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicAutomation" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "trigger_config" JSONB NOT NULL,
    "action_type" TEXT NOT NULL,
    "action_config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(6),
    "next_run_at" TIMESTAMP(6),
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicMessageTemplate" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "variables" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicMessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DentistSchedule" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "dentist_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "break_start" TEXT,
    "break_end" TEXT,
    "slot_duration" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" DATE,
    "valid_until" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DentistSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_editable" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorCode" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" TEXT NOT NULL,
    "clinic_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Odontogram" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "dentition_type" "DentitionType" NOT NULL DEFAULT 'PERMANENT',
    "created_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Odontogram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdontogramEntry" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "odontogram_id" TEXT NOT NULL,
    "tooth_number" INTEGER NOT NULL,
    "entry_type" "OdontogramEntryType" NOT NULL,
    "status_code" TEXT NOT NULL,
    "surfaces" "ToothSurface"[] DEFAULT ARRAY['WHOLE']::"ToothSurface"[],
    "notes" TEXT,
    "created_by" TEXT,
    "superseded_by" TEXT,
    "superseded_at" TIMESTAMP(6),
    "treatment_plan_item_id" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OdontogramEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdontogramLegendItem" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "clinic_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OdontogramLegendItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "dentist_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pdf_url" TEXT,
    "sent_at" TIMESTAMP(6),
    "sent_via" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpsSurvey" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "score" INTEGER,
    "feedback" TEXT,
    "sent_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(6),

    CONSTRAINT "NpsSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anamnesis" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "filled_by_id" TEXT,
    "allergies" TEXT DEFAULT '[]',
    "medications" TEXT DEFAULT '[]',
    "conditions" TEXT DEFAULT '[]',
    "surgeries" TEXT,
    "habits" TEXT,
    "risk_classification" TEXT,
    "contraindications" TEXT DEFAULT '[]',
    "alerts" TEXT DEFAULT '[]',
    "warnings" TEXT DEFAULT '[]',
    "ai_notes" TEXT,
    "ai_recommendations" TEXT,
    "raw_answers" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anamnesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "patient_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "created_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "patient_summary" TEXT,
    "phases" TEXT,
    "total_cost" DECIMAL(10,2),
    "total_sessions" INTEGER,
    "recommendations" TEXT,
    "odontogram_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlanItem" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "treatment_plan_id" TEXT NOT NULL,
    "tooth_number" INTEGER,
    "procedure_code" TEXT NOT NULL,
    "description" TEXT,
    "status" "TreatmentPlanItemStatus" NOT NULL DEFAULT 'PLANNED',
    "estimated_cost" DECIMAL(10,2),
    "actual_cost" DECIMAL(10,2),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(6),
    "completed_by" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_google_id_key" ON "User"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_reset_token_key" ON "User"("reset_token");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clinic_id_idx" ON "User"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_cnpj_key" ON "Clinic"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_slug_key" ON "Clinic"("slug");

-- CreateIndex
CREATE INDEX "idx_clinic_cnpj" ON "Clinic"("cnpj");

-- CreateIndex
CREATE INDEX "idx_clinic_status" ON "Clinic"("status");

-- CreateIndex
CREATE INDEX "idx_clinic_slug" ON "Clinic"("slug");

-- CreateIndex
CREATE INDEX "Dentist_clinic_id_idx" ON "Dentist"("clinic_id");

-- CreateIndex
CREATE INDEX "Dentist_cro_idx" ON "Dentist"("cro");

-- CreateIndex
CREATE INDEX "idx_dentist_phone_hash" ON "Dentist"("phone_hash");

-- CreateIndex
CREATE UNIQUE INDEX "Dentist_clinic_id_cro_key" ON "Dentist"("clinic_id", "cro");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_portal_token_key" ON "Patient"("portal_token");

-- CreateIndex
CREATE INDEX "idx_patient_clinic" ON "Patient"("clinic_id");

-- CreateIndex
CREATE INDEX "idx_patient_phone" ON "Patient"("phone");

-- CreateIndex
CREATE INDEX "idx_patient_phone_hash" ON "Patient"("phone_hash");

-- CreateIndex
CREATE INDEX "idx_patient_cpf_hash" ON "Patient"("cpf_hash");

-- CreateIndex
CREATE INDEX "idx_patient_email_hash" ON "Patient"("email_hash");

-- CreateIndex
CREATE INDEX "idx_patient_clinic_status" ON "Patient"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "idx_patient_clinic_deleted" ON "Patient"("clinic_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_patient_clinic_birth_date" ON "Patient"("clinic_id", "birth_date");

-- CreateIndex
CREATE INDEX "idx_patient_clinic_status_last_visit" ON "Patient"("clinic_id", "status", "last_visit");

-- CreateIndex
CREATE UNIQUE INDEX "unique_clinic_phone" ON "Patient"("clinic_id", "phone");

-- CreateIndex
CREATE INDEX "Service_clinic_id_idx" ON "Service"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "Service_clinic_id_name_key" ON "Service"("clinic_id", "name");

-- CreateIndex
CREATE INDEX "idx_appointment_clinic" ON "Appointment"("clinic_id");

-- CreateIndex
CREATE INDEX "idx_appointment_patient" ON "Appointment"("patient_id");

-- CreateIndex
CREATE INDEX "idx_appointment_date" ON "Appointment"("date");

-- CreateIndex
CREATE INDEX "idx_appointment_status" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "idx_appointment_clinic_date" ON "Appointment"("clinic_id", "date");

-- CreateIndex
CREATE INDEX "idx_appointment_clinic_status" ON "Appointment"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "idx_appointment_clinic_date_status" ON "Appointment"("clinic_id", "date", "status");

-- CreateIndex
CREATE INDEX "idx_appointment_dentist" ON "Appointment"("dentist_id");

-- CreateIndex
CREATE INDEX "idx_appointment_reminder_date" ON "Appointment"("reminder_sent", "date");

-- CreateIndex
CREATE INDEX "idx_appointment_clinic_dentist_date" ON "Appointment"("clinic_id", "dentist_id", "date");

-- CreateIndex
CREATE INDEX "Conversation_clinic_id_idx" ON "Conversation"("clinic_id");

-- CreateIndex
CREATE INDEX "Conversation_patient_id_idx" ON "Conversation"("patient_id");

-- CreateIndex
CREATE INDEX "idx_log_patient" ON "ConversationLog"("patient_id");

-- CreateIndex
CREATE INDEX "idx_log_timestamp" ON "ConversationLog"("timestamp");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_clinic_id_idx" ON "WhatsAppMessage"("clinic_id");

-- CreateIndex
CREATE INDEX "idx_whatsapp_phone_hash" ON "WhatsAppMessage"("phone_hash");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_created_at_idx" ON "WhatsAppMessage"("created_at");

-- CreateIndex
CREATE INDEX "idx_whatsapp_clinic_created" ON "WhatsAppMessage"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "AuditLog_clinic_id_idx" ON "AuditLog"("clinic_id");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");

-- CreateIndex
CREATE INDEX "idx_audit_clinic_created" ON "AuditLog"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_user_created" ON "AuditLog"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE INDEX "Plan_status_idx" ON "Plan"("status");

-- CreateIndex
CREATE INDEX "Plan_sort_order_idx" ON "Plan"("sort_order");

-- CreateIndex
CREATE INDEX "Subscription_clinic_id_idx" ON "Subscription"("clinic_id");

-- CreateIndex
CREATE INDEX "Subscription_plan_id_idx" ON "Subscription"("plan_id");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_current_period_end_idx" ON "Subscription"("current_period_end");

-- CreateIndex
CREATE INDEX "idx_subscription_clinic_status" ON "Subscription"("clinic_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_clinic_id_idx" ON "Invoice"("clinic_id");

-- CreateIndex
CREATE INDEX "Invoice_subscription_id_idx" ON "Invoice"("subscription_id");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_due_date_idx" ON "Invoice"("due_date");

-- CreateIndex
CREATE INDEX "Invoice_number_idx" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "idx_invoice_clinic_status" ON "Invoice"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "idx_invoice_clinic_due_date" ON "Invoice"("clinic_id", "due_date");

-- CreateIndex
CREATE INDEX "Payment_invoice_id_idx" ON "Payment"("invoice_id");

-- CreateIndex
CREATE INDEX "Payment_gateway_payment_id_idx" ON "Payment"("gateway_payment_id");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_is_active_idx" ON "Coupon"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAiSettings_clinic_id_key" ON "ClinicAiSettings"("clinic_id");

-- CreateIndex
CREATE INDEX "ClinicAiSettings_clinic_id_idx" ON "ClinicAiSettings"("clinic_id");

-- CreateIndex
CREATE INDEX "ClinicAutomation_clinic_id_idx" ON "ClinicAutomation"("clinic_id");

-- CreateIndex
CREATE INDEX "ClinicAutomation_type_idx" ON "ClinicAutomation"("type");

-- CreateIndex
CREATE INDEX "ClinicAutomation_is_active_idx" ON "ClinicAutomation"("is_active");

-- CreateIndex
CREATE INDEX "ClinicAutomation_next_run_at_idx" ON "ClinicAutomation"("next_run_at");

-- CreateIndex
CREATE INDEX "ClinicMessageTemplate_clinic_id_idx" ON "ClinicMessageTemplate"("clinic_id");

-- CreateIndex
CREATE INDEX "ClinicMessageTemplate_type_idx" ON "ClinicMessageTemplate"("type");

-- CreateIndex
CREATE INDEX "ClinicMessageTemplate_is_active_idx" ON "ClinicMessageTemplate"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicMessageTemplate_clinic_id_name_key" ON "ClinicMessageTemplate"("clinic_id", "name");

-- CreateIndex
CREATE INDEX "DentistSchedule_dentist_id_idx" ON "DentistSchedule"("dentist_id");

-- CreateIndex
CREATE INDEX "DentistSchedule_day_of_week_idx" ON "DentistSchedule"("day_of_week");

-- CreateIndex
CREATE INDEX "DentistSchedule_is_active_idx" ON "DentistSchedule"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "DentistSchedule_dentist_id_day_of_week_valid_from_key" ON "DentistSchedule"("dentist_id", "day_of_week", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_key_idx" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_category_idx" ON "SystemConfig"("category");

-- CreateIndex
CREATE INDEX "SystemConfig_is_public_idx" ON "SystemConfig"("is_public");

-- CreateIndex
CREATE INDEX "TwoFactorCode_user_id_idx" ON "TwoFactorCode"("user_id");

-- CreateIndex
CREATE INDEX "TwoFactorCode_expires_at_idx" ON "TwoFactorCode"("expires_at");

-- CreateIndex
CREATE INDEX "Notification_user_id_read_idx" ON "Notification"("user_id", "read");

-- CreateIndex
CREATE INDEX "Notification_clinic_id_idx" ON "Notification"("clinic_id");

-- CreateIndex
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");

-- CreateIndex
CREATE INDEX "idx_notification_user_created" ON "Notification"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "Odontogram_patient_id_idx" ON "Odontogram"("patient_id");

-- CreateIndex
CREATE INDEX "Odontogram_clinic_id_idx" ON "Odontogram"("clinic_id");

-- CreateIndex
CREATE INDEX "OdontogramEntry_odontogram_id_idx" ON "OdontogramEntry"("odontogram_id");

-- CreateIndex
CREATE INDEX "OdontogramEntry_tooth_number_idx" ON "OdontogramEntry"("tooth_number");

-- CreateIndex
CREATE INDEX "OdontogramEntry_odontogram_id_tooth_number_created_at_idx" ON "OdontogramEntry"("odontogram_id", "tooth_number", "created_at" DESC);

-- CreateIndex
CREATE INDEX "OdontogramEntry_superseded_at_idx" ON "OdontogramEntry"("superseded_at");

-- CreateIndex
CREATE INDEX "OdontogramLegendItem_clinic_id_idx" ON "OdontogramLegendItem"("clinic_id");

-- CreateIndex
CREATE INDEX "OdontogramLegendItem_is_active_idx" ON "OdontogramLegendItem"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "OdontogramLegendItem_clinic_id_code_key" ON "OdontogramLegendItem"("clinic_id", "code");

-- CreateIndex
CREATE INDEX "Prescription_patient_id_idx" ON "Prescription"("patient_id");

-- CreateIndex
CREATE INDEX "Prescription_dentist_id_idx" ON "Prescription"("dentist_id");

-- CreateIndex
CREATE INDEX "Prescription_clinic_id_idx" ON "Prescription"("clinic_id");

-- CreateIndex
CREATE INDEX "NpsSurvey_clinic_id_idx" ON "NpsSurvey"("clinic_id");

-- CreateIndex
CREATE INDEX "NpsSurvey_patient_id_idx" ON "NpsSurvey"("patient_id");

-- CreateIndex
CREATE INDEX "NpsSurvey_appointment_id_idx" ON "NpsSurvey"("appointment_id");

-- CreateIndex
CREATE INDEX "NpsSurvey_sent_at_idx" ON "NpsSurvey"("sent_at");

-- CreateIndex
CREATE INDEX "Anamnesis_patient_id_idx" ON "Anamnesis"("patient_id");

-- CreateIndex
CREATE INDEX "Anamnesis_clinic_id_idx" ON "Anamnesis"("clinic_id");

-- CreateIndex
CREATE INDEX "TreatmentPlan_patient_id_idx" ON "TreatmentPlan"("patient_id");

-- CreateIndex
CREATE INDEX "TreatmentPlan_clinic_id_idx" ON "TreatmentPlan"("clinic_id");

-- CreateIndex
CREATE INDEX "TreatmentPlan_status_idx" ON "TreatmentPlan"("status");

-- CreateIndex
CREATE INDEX "TreatmentPlanItem_treatment_plan_id_idx" ON "TreatmentPlanItem"("treatment_plan_id");

-- CreateIndex
CREATE INDEX "TreatmentPlanItem_status_idx" ON "TreatmentPlanItem"("status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dentist" ADD CONSTRAINT "Dentist_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "Dentist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationLog" ADD CONSTRAINT "ConversationLog_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAiSettings" ADD CONSTRAINT "ClinicAiSettings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAutomation" ADD CONSTRAINT "ClinicAutomation_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicMessageTemplate" ADD CONSTRAINT "ClinicMessageTemplate_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentistSchedule" ADD CONSTRAINT "DentistSchedule_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "Dentist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorCode" ADD CONSTRAINT "TwoFactorCode_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odontogram" ADD CONSTRAINT "Odontogram_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramEntry" ADD CONSTRAINT "OdontogramEntry_odontogram_id_fkey" FOREIGN KEY ("odontogram_id") REFERENCES "Odontogram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramEntry" ADD CONSTRAINT "OdontogramEntry_treatment_plan_item_id_fkey" FOREIGN KEY ("treatment_plan_item_id") REFERENCES "TreatmentPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramEntry" ADD CONSTRAINT "OdontogramEntry_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "OdontogramEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "Dentist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsSurvey" ADD CONSTRAINT "NpsSurvey_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsSurvey" ADD CONSTRAINT "NpsSurvey_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anamnesis" ADD CONSTRAINT "Anamnesis_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_odontogram_id_fkey" FOREIGN KEY ("odontogram_id") REFERENCES "Odontogram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_treatment_plan_id_fkey" FOREIGN KEY ("treatment_plan_id") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

