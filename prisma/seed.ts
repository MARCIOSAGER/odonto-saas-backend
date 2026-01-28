import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

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
