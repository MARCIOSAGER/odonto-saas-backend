import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ============================================
  // SEED DE PLANOS
  // ============================================

  const basicPlan = await prisma.plan.upsert({
    where: { name: 'basic' },
    update: {
      display_name: 'Básico',
      price_monthly: 0,
      price_yearly: 0,
      max_patients: 50,
      max_dentists: 2,
      max_appointments_month: 100,
      max_whatsapp_messages: null,
      ai_enabled: false,
      ai_messages_limit: null,
      priority_support: false,
      custom_branding: false,
      api_access: false,
      features: {
        has_whatsapp: false,
        has_whatsapp_automation: false,
        has_ai: false,
        ai_level: 'none',
        has_odontogram: true,
        has_reports: true,
        reports_level: 'basic',
        has_nfse_auto: false,
        has_patient_portal: false,
        has_prescription: true,
        has_nps: false,
      },
      sort_order: 0,
    },
    create: {
      name: 'basic',
      display_name: 'Básico',
      description: 'Ideal para começar. Gerencie sua clínica com as funcionalidades essenciais.',
      price_monthly: 0,
      price_yearly: 0,
      max_patients: 50,
      max_dentists: 2,
      max_appointments_month: 100,
      max_whatsapp_messages: null,
      ai_enabled: false,
      ai_messages_limit: null,
      priority_support: false,
      custom_branding: false,
      api_access: false,
      features: {
        has_whatsapp: false,
        has_whatsapp_automation: false,
        has_ai: false,
        ai_level: 'none',
        has_odontogram: true,
        has_reports: true,
        reports_level: 'basic',
        has_nfse_auto: false,
        has_patient_portal: false,
        has_prescription: true,
        has_nps: false,
      },
      status: 'active',
      sort_order: 0,
    },
  });

  const standardPlan = await prisma.plan.upsert({
    where: { name: 'standard' },
    update: {
      display_name: 'Padrão',
      price_monthly: 197,
      price_yearly: 1970,
      max_patients: 500,
      max_dentists: 10,
      max_appointments_month: 1000,
      max_whatsapp_messages: 5000,
      ai_enabled: true,
      ai_messages_limit: 500,
      priority_support: false,
      custom_branding: true,
      api_access: false,
      features: {
        has_whatsapp: true,
        has_whatsapp_automation: false,
        has_ai: true,
        ai_level: 'basic',
        has_odontogram: true,
        has_reports: true,
        reports_level: 'full',
        has_nfse_auto: false,
        has_patient_portal: true,
        has_prescription: true,
        has_nps: false,
      },
      sort_order: 1,
    },
    create: {
      name: 'standard',
      display_name: 'Padrão',
      description: 'Para clínicas em crescimento. WhatsApp, IA básica e relatórios completos.',
      price_monthly: 197,
      price_yearly: 1970,
      max_patients: 500,
      max_dentists: 10,
      max_appointments_month: 1000,
      max_whatsapp_messages: 5000,
      ai_enabled: true,
      ai_messages_limit: 500,
      priority_support: false,
      custom_branding: true,
      api_access: false,
      features: {
        has_whatsapp: true,
        has_whatsapp_automation: false,
        has_ai: true,
        ai_level: 'basic',
        has_odontogram: true,
        has_reports: true,
        reports_level: 'full',
        has_nfse_auto: false,
        has_patient_portal: true,
        has_prescription: true,
        has_nps: false,
      },
      status: 'active',
      sort_order: 1,
    },
  });

  const premiumPlan = await prisma.plan.upsert({
    where: { name: 'premium' },
    update: {
      display_name: 'Premium',
      price_monthly: 397,
      price_yearly: 3970,
      max_patients: null,
      max_dentists: null,
      max_appointments_month: null,
      max_whatsapp_messages: null,
      ai_enabled: true,
      ai_messages_limit: null,
      priority_support: true,
      custom_branding: true,
      api_access: true,
      features: {
        has_whatsapp: true,
        has_whatsapp_automation: true,
        has_ai: true,
        ai_level: 'full',
        has_odontogram: true,
        has_reports: true,
        reports_level: 'full',
        has_nfse_auto: true,
        has_patient_portal: true,
        has_prescription: true,
        has_nps: true,
      },
      sort_order: 2,
    },
    create: {
      name: 'premium',
      display_name: 'Premium',
      description: 'Tudo ilimitado. IA completa, automações WhatsApp, NFS-e automática e suporte prioritário.',
      price_monthly: 397,
      price_yearly: 3970,
      max_patients: null,
      max_dentists: null,
      max_appointments_month: null,
      max_whatsapp_messages: null,
      ai_enabled: true,
      ai_messages_limit: null,
      priority_support: true,
      custom_branding: true,
      api_access: true,
      features: {
        has_whatsapp: true,
        has_whatsapp_automation: true,
        has_ai: true,
        ai_level: 'full',
        has_odontogram: true,
        has_reports: true,
        reports_level: 'full',
        has_nfse_auto: true,
        has_patient_portal: true,
        has_prescription: true,
        has_nps: true,
      },
      status: 'active',
      sort_order: 2,
    },
  });

  console.log('Created plans:', basicPlan.name, standardPlan.name, premiumPlan.name);

  // ============================================
  // SEED DE CONFIGURAÇÕES DE PLATAFORMA (BRANDING)
  // ============================================

  const platformBrandingConfigs = [
    {
      key: 'platform_name',
      value: 'Odonto SaaS',
      type: 'string',
      description: 'Nome da plataforma exibido no site e telas de login',
      is_public: true,
      is_editable: true,
      category: 'platform_branding',
    },
    {
      key: 'platform_description',
      value: 'Sistema completo para gestão de clínicas odontológicas',
      type: 'string',
      description: 'Descrição da plataforma (meta description e footer)',
      is_public: true,
      is_editable: true,
      category: 'platform_branding',
    },
    {
      key: 'platform_logo_url',
      value: '',
      type: 'string',
      description: 'URL do logo da plataforma (vazio = usar SVG padrão)',
      is_public: true,
      is_editable: true,
      category: 'platform_branding',
    },
    {
      key: 'platform_favicon_url',
      value: '',
      type: 'string',
      description: 'URL do favicon da plataforma (vazio = usar padrão)',
      is_public: true,
      is_editable: true,
      category: 'platform_branding',
    },
    {
      key: 'platform_primary_color',
      value: '#0EA5E9',
      type: 'string',
      description: 'Cor primária da plataforma (hex)',
      is_public: true,
      is_editable: true,
      category: 'platform_branding',
    },
    {
      key: 'platform_secondary_color',
      value: '#10B981',
      type: 'string',
      description: 'Cor secundária da plataforma (hex)',
      is_public: true,
      is_editable: true,
      category: 'platform_branding',
    },
    {
      key: 'platform_hero_title',
      value: 'Gestão completa para sua clínica odontológica',
      type: 'string',
      description: 'Título da seção hero na landing page',
      is_public: true,
      is_editable: true,
      category: 'platform_branding',
    },
    {
      key: 'platform_hero_subtitle',
      value: 'Agenda, prontuários, financeiro, WhatsApp e inteligência artificial em uma única plataforma. Tudo que você precisa para crescer.',
      type: 'string',
      description: 'Subtítulo da seção hero na landing page',
      is_public: true,
      is_editable: true,
      category: 'platform_branding',
    },
  ];

  for (const config of platformBrandingConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  console.log('Created platform branding configs:', platformBrandingConfigs.length);

  // ============================================
  // SEED DE CONFIGURAÇÕES DE GATEWAY DE PAGAMENTO
  // ============================================

  const paymentGatewayConfigs = [
    {
      key: 'payment_gateway_active',
      value: 'none',
      type: 'string',
      description: 'Gateway ativo: none, stripe, asaas',
      is_public: false,
      is_editable: true,
      category: 'payment_gateway',
    },
    {
      key: 'stripe_secret_key',
      value: '',
      type: 'string',
      description: 'Chave secreta do Stripe (sk_live_... ou sk_test_...)',
      is_public: false,
      is_editable: true,
      category: 'payment_gateway',
    },
    {
      key: 'stripe_webhook_secret',
      value: '',
      type: 'string',
      description: 'Segredo do webhook do Stripe (whsec_...)',
      is_public: false,
      is_editable: true,
      category: 'payment_gateway',
    },
    {
      key: 'stripe_publishable_key',
      value: '',
      type: 'string',
      description: 'Chave publicável do Stripe (pk_live_... ou pk_test_...)',
      is_public: false,
      is_editable: true,
      category: 'payment_gateway',
    },
    {
      key: 'asaas_api_key',
      value: '',
      type: 'string',
      description: 'API Key do Asaas',
      is_public: false,
      is_editable: true,
      category: 'payment_gateway',
    },
    {
      key: 'asaas_webhook_token',
      value: '',
      type: 'string',
      description: 'Token de webhook do Asaas',
      is_public: false,
      is_editable: true,
      category: 'payment_gateway',
    },
    {
      key: 'asaas_sandbox',
      value: 'true',
      type: 'boolean',
      description: 'Usar ambiente sandbox do Asaas (true/false)',
      is_public: false,
      is_editable: true,
      category: 'payment_gateway',
    },
  ];

  for (const config of paymentGatewayConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  console.log('Created payment gateway configs:', paymentGatewayConfigs.length);

  // ============================================
  // SEED DE CONFIGURAÇÕES SMTP PADRÃO
  // ============================================

  const smtpConfigs = [
    {
      key: 'smtp_default_host',
      value: '',
      type: 'string',
      description: 'Servidor SMTP padrão para clínicas sem SMTP próprio',
      is_public: false,
      is_editable: true,
      category: 'smtp',
    },
    {
      key: 'smtp_default_port',
      value: '587',
      type: 'string',
      description: 'Porta SMTP padrão',
      is_public: false,
      is_editable: true,
      category: 'smtp',
    },
    {
      key: 'smtp_default_user',
      value: '',
      type: 'string',
      description: 'Usuário SMTP padrão',
      is_public: false,
      is_editable: true,
      category: 'smtp',
    },
    {
      key: 'smtp_default_pass',
      value: '',
      type: 'string',
      description: 'Senha SMTP padrão',
      is_public: false,
      is_editable: true,
      category: 'smtp',
    },
    {
      key: 'smtp_default_from',
      value: '',
      type: 'string',
      description: 'E-mail remetente padrão (ex: noreply@seudominio.com)',
      is_public: false,
      is_editable: true,
      category: 'smtp',
    },
  ];

  for (const config of smtpConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  console.log('Created SMTP configs:', smtpConfigs.length);

  // ============================================
  // SEED DE CONFIGURAÇÕES GERAIS DA PLATAFORMA
  // ============================================

  const generalConfigs = [
    {
      key: 'platform_support_email',
      value: '',
      type: 'string',
      description: 'E-mail de suporte exibido na plataforma',
      is_public: true,
      is_editable: true,
      category: 'general',
    },
    {
      key: 'platform_support_whatsapp',
      value: '',
      type: 'string',
      description: 'WhatsApp de suporte (apenas números, ex: 5511999999999)',
      is_public: true,
      is_editable: true,
      category: 'general',
    },
    {
      key: 'platform_terms_url',
      value: '',
      type: 'string',
      description: 'URL dos termos de uso',
      is_public: true,
      is_editable: true,
      category: 'general',
    },
    {
      key: 'platform_privacy_url',
      value: '',
      type: 'string',
      description: 'URL da política de privacidade',
      is_public: true,
      is_editable: true,
      category: 'general',
    },
  ];

  for (const config of generalConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  console.log('Created general configs:', generalConfigs.length);

  // ============================================
  // SEED DE DADOS DEMO
  // ============================================

  // Create demo clinic
  const clinic = await prisma.clinic.upsert({
    where: { cnpj: '12345678000199' },
    update: {},
    create: {
      name: 'Clínica Odontológica Demo',
      cnpj: '12345678000199',
      phone: '11999999999',
      email: 'contato@clinicademo.com',
      address: 'Rua Exemplo, 123',
      city: 'São Paulo',
      state: 'SP',
      plan: 'premium',
      status: 'active',
    },
  });

  console.log('Created clinic:', clinic.name);

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@clinicademo.com' },
    update: {},
    create: {
      email: 'admin@clinicademo.com',
      password: hashedPassword,
      name: 'Administrador',
      role: 'admin',
      clinic_id: clinic.id,
      status: 'active',
    },
  });

  console.log('Created user:', user.email);

  // Create dentists
  const dentist1 = await prisma.dentist.upsert({
    where: { clinic_id_cro: { clinic_id: clinic.id, cro: 'SP-12345' } },
    update: {},
    create: {
      clinic_id: clinic.id,
      name: 'Dr. João Silva',
      cro: 'SP-12345',
      specialty: 'Ortodontia',
      phone: '11988888888',
      email: 'dr.joao@clinicademo.com',
      status: 'active',
    },
  });

  const dentist2 = await prisma.dentist.upsert({
    where: { clinic_id_cro: { clinic_id: clinic.id, cro: 'SP-67890' } },
    update: {},
    create: {
      clinic_id: clinic.id,
      name: 'Dra. Maria Santos',
      cro: 'SP-67890',
      specialty: 'Endodontia',
      phone: '11977777777',
      email: 'dra.maria@clinicademo.com',
      status: 'active',
    },
  });

  console.log('Created dentists:', dentist1.name, dentist2.name);

  // Create services
  const services = await Promise.all([
    prisma.service.upsert({
      where: { clinic_id_name: { clinic_id: clinic.id, name: 'Limpeza' } },
      update: {},
      create: {
        clinic_id: clinic.id,
        name: 'Limpeza',
        description: 'Limpeza dental completa',
        price: 150.0,
        duration: 30,
        status: 'active',
      },
    }),
    prisma.service.upsert({
      where: { clinic_id_name: { clinic_id: clinic.id, name: 'Clareamento' } },
      update: {},
      create: {
        clinic_id: clinic.id,
        name: 'Clareamento',
        description: 'Clareamento dental a laser',
        price: 800.0,
        duration: 60,
        status: 'active',
      },
    }),
    prisma.service.upsert({
      where: { clinic_id_name: { clinic_id: clinic.id, name: 'Extração' } },
      update: {},
      create: {
        clinic_id: clinic.id,
        name: 'Extração',
        description: 'Extração de dente',
        price: 250.0,
        duration: 45,
        status: 'active',
      },
    }),
    prisma.service.upsert({
      where: { clinic_id_name: { clinic_id: clinic.id, name: 'Consulta' } },
      update: {},
      create: {
        clinic_id: clinic.id,
        name: 'Consulta',
        description: 'Consulta de avaliação',
        price: 100.0,
        duration: 30,
        status: 'active',
      },
    }),
  ]);

  console.log('Created services:', services.length);

  // Create demo patients
  const patient1 = await prisma.patient.upsert({
    where: { clinic_id_phone: { clinic_id: clinic.id, phone: '11966666666' } },
    update: {},
    create: {
      clinic_id: clinic.id,
      name: 'Carlos Oliveira',
      phone: '11966666666',
      cpf: '12345678901',
      email: 'carlos@email.com',
      status: 'active',
    },
  });

  const patient2 = await prisma.patient.upsert({
    where: { clinic_id_phone: { clinic_id: clinic.id, phone: '11955555555' } },
    update: {},
    create: {
      clinic_id: clinic.id,
      name: 'Ana Paula Costa',
      phone: '11955555555',
      cpf: '98765432109',
      email: 'ana@email.com',
      status: 'active',
    },
  });

  console.log('Created patients:', patient1.name, patient2.name);

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
