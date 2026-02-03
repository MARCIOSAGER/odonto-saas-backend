import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnamnesisService } from './anamnesis.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('AnamnesisService', () => {
  let service: AnamnesisService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { log: jest.Mock };

  const clinicId = 'clinic-uuid-1';
  const userId = 'user-uuid-1';

  const mockAnamnesis = {
    id: 'anamnesis-uuid-1',
    clinic_id: clinicId,
    patient_id: 'patient-uuid-1',
    filled_by_id: userId,
    allergies: ['Penicilina'],
    medications: ['Losartana'],
    conditions: ['Hipertensao'],
    surgeries: 'Nenhuma',
    habits: { smoking: false },
    raw_answers: { q1: 'sim' },
    risk_classification: null,
    contraindications: null,
    alerts: null,
    warnings: null,
    ai_notes: null,
    ai_recommendations: null,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    patient: { name: 'Maria Silva', phone: '11999', cpf: '123' },
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnamnesisService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<AnamnesisService>(AnamnesisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      patient_id: 'patient-uuid-1',
      allergies: ['Penicilina'],
      medications: ['Losartana'],
      conditions: ['Hipertensao'],
      surgeries: 'Nenhuma',
      habits: { smoking: false },
      raw_answers: { q1: 'sim' },
    };

    it('should create an anamnesis and log audit', async () => {
      prisma.anamnesis.create.mockResolvedValue(mockAnamnesis);
      auditService.log.mockResolvedValue(undefined);

      const result = await service.create(clinicId, userId, createDto as any);

      expect(result).toEqual(mockAnamnesis);
      expect(prisma.anamnesis.create).toHaveBeenCalledWith({
        data: {
          clinic_id: clinicId,
          patient_id: createDto.patient_id,
          filled_by_id: userId,
          allergies: createDto.allergies,
          medications: createDto.medications,
          conditions: createDto.conditions,
          surgeries: createDto.surgeries,
          habits: createDto.habits,
          raw_answers: createDto.raw_answers,
        },
        include: {
          patient: { select: { name: true, phone: true, cpf: true } },
        },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'CREATE',
        entity: 'Anamnesis',
        entityId: mockAnamnesis.id,
        clinicId,
        userId,
        newValues: mockAnamnesis,
      });
    });

    it('should default allergies, medications, conditions to empty arrays when not provided', async () => {
      const minimalDto = { patient_id: 'patient-uuid-1' };
      prisma.anamnesis.create.mockResolvedValue(mockAnamnesis);
      auditService.log.mockResolvedValue(undefined);

      await service.create(clinicId, userId, minimalDto as any);

      expect(prisma.anamnesis.create).toHaveBeenCalledWith({
        data: {
          clinic_id: clinicId,
          patient_id: minimalDto.patient_id,
          filled_by_id: userId,
          allergies: [],
          medications: [],
          conditions: [],
          surgeries: undefined,
          habits: undefined,
          raw_answers: undefined,
        },
        include: {
          patient: { select: { name: true, phone: true, cpf: true } },
        },
      });
    });
  });

  // ──────────────────────────────────────────────────
  // findByPatient
  // ──────────────────────────────────────────────────
  describe('findByPatient', () => {
    it('should return anamneses for a specific patient ordered by created_at desc', async () => {
      const anamneses = [mockAnamnesis];
      prisma.anamnesis.findMany.mockResolvedValue(anamneses);

      const result = await service.findByPatient(clinicId, 'patient-uuid-1');

      expect(result).toEqual(anamneses);
      expect(prisma.anamnesis.findMany).toHaveBeenCalledWith({
        where: { clinic_id: clinicId, patient_id: 'patient-uuid-1' },
        orderBy: { created_at: 'desc' },
        include: {
          patient: { select: { name: true } },
        },
      });
    });

    it('should return empty array when patient has no anamneses', async () => {
      prisma.anamnesis.findMany.mockResolvedValue([]);

      const result = await service.findByPatient(clinicId, 'patient-uuid-2');

      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────
  // findLatest
  // ──────────────────────────────────────────────────
  describe('findLatest', () => {
    it('should return the latest anamnesis for a patient', async () => {
      prisma.anamnesis.findFirst.mockResolvedValue(mockAnamnesis);

      const result = await service.findLatest(clinicId, 'patient-uuid-1');

      expect(result).toEqual(mockAnamnesis);
      expect(prisma.anamnesis.findFirst).toHaveBeenCalledWith({
        where: { clinic_id: clinicId, patient_id: 'patient-uuid-1' },
        orderBy: { created_at: 'desc' },
        include: {
          patient: { select: { name: true, phone: true, cpf: true } },
        },
      });
    });

    it('should return null when patient has no anamneses', async () => {
      prisma.anamnesis.findFirst.mockResolvedValue(null);

      const result = await service.findLatest(clinicId, 'patient-uuid-2');

      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────
  // findById
  // ──────────────────────────────────────────────────
  describe('findById', () => {
    it('should return an anamnesis by id and clinic_id', async () => {
      const anamnesisWithFullPatient = {
        ...mockAnamnesis,
        patient: {
          name: 'Maria Silva',
          phone: '11999',
          cpf: '123',
          email: 'maria@email.com',
          birth_date: new Date('1990-05-15'),
        },
      };
      prisma.anamnesis.findFirst.mockResolvedValue(anamnesisWithFullPatient);

      const result = await service.findById(clinicId, 'anamnesis-uuid-1');

      expect(result).toEqual(anamnesisWithFullPatient);
      expect(prisma.anamnesis.findFirst).toHaveBeenCalledWith({
        where: { id: 'anamnesis-uuid-1', clinic_id: clinicId },
        include: {
          patient: {
            select: {
              name: true,
              phone: true,
              cpf: true,
              email: true,
              birth_date: true,
            },
          },
        },
      });
    });

    it('should throw NotFoundException when anamnesis not found', async () => {
      prisma.anamnesis.findFirst.mockResolvedValue(null);

      await expect(
        service.findById(clinicId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with correct message', async () => {
      prisma.anamnesis.findFirst.mockResolvedValue(null);

      await expect(
        service.findById(clinicId, 'non-existent-id'),
      ).rejects.toThrow('Anamnese não encontrada');
    });
  });

  // ──────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────
  describe('update', () => {
    const updateDto = {
      allergies: ['Penicilina', 'Dipirona'],
      risk_classification: 'medium',
    };

    it('should update an anamnesis and log audit', async () => {
      const existingAnamnesis = {
        ...mockAnamnesis,
        patient: {
          name: 'Maria Silva',
          phone: '11999',
          cpf: '123',
          email: 'maria@email.com',
          birth_date: new Date('1990-05-15'),
        },
      };
      const updatedAnamnesis = {
        ...mockAnamnesis,
        allergies: ['Penicilina', 'Dipirona'],
        risk_classification: 'medium',
      };

      prisma.anamnesis.findFirst.mockResolvedValue(existingAnamnesis);
      prisma.anamnesis.update.mockResolvedValue(updatedAnamnesis);
      auditService.log.mockResolvedValue(undefined);

      const result = await service.update(clinicId, 'anamnesis-uuid-1', updateDto as any, userId);

      expect(result).toEqual(updatedAnamnesis);
      expect(prisma.anamnesis.findFirst).toHaveBeenCalledWith({
        where: { id: 'anamnesis-uuid-1', clinic_id: clinicId },
        include: {
          patient: {
            select: {
              name: true,
              phone: true,
              cpf: true,
              email: true,
              birth_date: true,
            },
          },
        },
      });
      expect(prisma.anamnesis.update).toHaveBeenCalledWith({
        where: { id: 'anamnesis-uuid-1' },
        data: {
          allergies: ['Penicilina', 'Dipirona'],
          risk_classification: 'medium',
        },
        include: {
          patient: { select: { name: true, phone: true, cpf: true } },
        },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'UPDATE',
        entity: 'Anamnesis',
        entityId: 'anamnesis-uuid-1',
        clinicId,
        userId,
        oldValues: existingAnamnesis,
        newValues: updatedAnamnesis,
      });
    });

    it('should only spread defined fields in the update data', async () => {
      const partialDto = { ai_notes: 'Paciente de alto risco' };
      const existingAnamnesis = {
        ...mockAnamnesis,
        patient: {
          name: 'Maria Silva',
          phone: '11999',
          cpf: '123',
          email: 'maria@email.com',
          birth_date: new Date('1990-05-15'),
        },
      };
      const updatedAnamnesis = {
        ...mockAnamnesis,
        ai_notes: 'Paciente de alto risco',
      };

      prisma.anamnesis.findFirst.mockResolvedValue(existingAnamnesis);
      prisma.anamnesis.update.mockResolvedValue(updatedAnamnesis);
      auditService.log.mockResolvedValue(undefined);

      await service.update(clinicId, 'anamnesis-uuid-1', partialDto as any, userId);

      expect(prisma.anamnesis.update).toHaveBeenCalledWith({
        where: { id: 'anamnesis-uuid-1' },
        data: {
          ai_notes: 'Paciente de alto risco',
        },
        include: {
          patient: { select: { name: true, phone: true, cpf: true } },
        },
      });
    });

    it('should throw NotFoundException if anamnesis does not exist', async () => {
      prisma.anamnesis.findFirst.mockResolvedValue(null);

      await expect(
        service.update(clinicId, 'non-existent-id', updateDto as any, userId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.anamnesis.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should handle update with all fields provided', async () => {
      const fullUpdateDto = {
        allergies: ['Latex'],
        medications: ['Metformina'],
        conditions: ['Diabetes'],
        surgeries: 'Apendicectomia',
        habits: { smoking: true, alcohol: false },
        raw_answers: { q1: 'nao', q2: 'sim' },
        risk_classification: 'high',
        contraindications: ['Anti-inflamatorios'],
        alerts: ['Alergia a latex'],
        warnings: ['Verificar glicemia'],
        ai_notes: 'Paciente diabetico',
        ai_recommendations: 'Evitar procedimentos longos',
      };
      const existingAnamnesis = {
        ...mockAnamnesis,
        patient: {
          name: 'Maria Silva',
          phone: '11999',
          cpf: '123',
          email: 'maria@email.com',
          birth_date: new Date('1990-05-15'),
        },
      };
      const updatedAnamnesis = { ...mockAnamnesis, ...fullUpdateDto };

      prisma.anamnesis.findFirst.mockResolvedValue(existingAnamnesis);
      prisma.anamnesis.update.mockResolvedValue(updatedAnamnesis);
      auditService.log.mockResolvedValue(undefined);

      const result = await service.update(clinicId, 'anamnesis-uuid-1', fullUpdateDto as any, userId);

      expect(result).toEqual(updatedAnamnesis);
      expect(prisma.anamnesis.update).toHaveBeenCalledWith({
        where: { id: 'anamnesis-uuid-1' },
        data: {
          allergies: fullUpdateDto.allergies,
          medications: fullUpdateDto.medications,
          conditions: fullUpdateDto.conditions,
          surgeries: fullUpdateDto.surgeries,
          habits: fullUpdateDto.habits,
          raw_answers: fullUpdateDto.raw_answers,
          risk_classification: fullUpdateDto.risk_classification,
          contraindications: fullUpdateDto.contraindications,
          alerts: fullUpdateDto.alerts,
          warnings: fullUpdateDto.warnings,
          ai_notes: fullUpdateDto.ai_notes,
          ai_recommendations: fullUpdateDto.ai_recommendations,
        },
        include: {
          patient: { select: { name: true, phone: true, cpf: true } },
        },
      });
    });
  });
});
