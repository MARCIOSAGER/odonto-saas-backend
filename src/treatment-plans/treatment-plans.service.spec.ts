import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TreatmentPlansService } from './treatment-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('TreatmentPlansService', () => {
  let service: TreatmentPlansService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { log: jest.Mock };

  const clinicId = 'clinic-uuid-1';
  const userId = 'user-uuid-1';

  const mockPlan = {
    id: 'plan-uuid-1',
    clinic_id: clinicId,
    created_by: userId,
    patient_id: 'patient-uuid-1',
    patient_summary: 'Paciente com caries multiplas',
    phases: [{ name: 'Fase 1', procedures: [] }],
    total_cost: 1500,
    total_sessions: 5,
    recommendations: 'Manter higiene',
    odontogram_id: null,
    notes: null,
    status: 'pending',
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    patient: { name: 'Maria Silva' },
    odontogram: null,
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreatmentPlansService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<TreatmentPlansService>(TreatmentPlansService);
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
      patient_summary: 'Paciente com caries multiplas',
      phases: [{ name: 'Fase 1', procedures: [] }],
      total_cost: 1500,
      total_sessions: 5,
      recommendations: 'Manter higiene',
      odontogram_id: undefined,
      notes: undefined,
    };

    it('should create a treatment plan and log audit', async () => {
      prisma.treatmentPlan.create.mockResolvedValue(mockPlan);

      const result = await service.create(clinicId, userId, createDto as any);

      expect(result).toEqual(mockPlan);
      expect(prisma.treatmentPlan.create).toHaveBeenCalledWith({
        data: {
          clinic_id: clinicId,
          created_by: userId,
          patient_id: createDto.patient_id,
          patient_summary: createDto.patient_summary,
          phases: createDto.phases,
          total_cost: createDto.total_cost,
          total_sessions: createDto.total_sessions,
          recommendations: createDto.recommendations,
          odontogram_id: createDto.odontogram_id,
          notes: createDto.notes,
        },
        include: {
          patient: { select: { name: true } },
          odontogram: true,
        },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'CREATE',
        entity: 'TreatmentPlan',
        entityId: mockPlan.id,
        clinicId,
        userId,
        newValues: mockPlan,
      });
    });

    it('should handle optional fields as undefined', async () => {
      const minimalDto = { patient_id: 'patient-uuid-1' };
      const minimalPlan = {
        ...mockPlan,
        patient_summary: undefined,
        phases: undefined,
        total_cost: undefined,
        total_sessions: undefined,
        recommendations: undefined,
        odontogram_id: undefined,
        notes: undefined,
      };
      prisma.treatmentPlan.create.mockResolvedValue(minimalPlan);

      const result = await service.create(clinicId, userId, minimalDto as any);

      expect(result).toEqual(minimalPlan);
      expect(prisma.treatmentPlan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinic_id: clinicId,
          created_by: userId,
          patient_id: 'patient-uuid-1',
        }),
        include: {
          patient: { select: { name: true } },
          odontogram: true,
        },
      });
    });
  });

  // ──────────────────────────────────────────────────
  // findByPatient
  // ──────────────────────────────────────────────────
  describe('findByPatient', () => {
    it('should return treatment plans for a specific patient ordered by created_at desc', async () => {
      const plans = [mockPlan];
      prisma.treatmentPlan.findMany.mockResolvedValue(plans);

      const result = await service.findByPatient(clinicId, 'patient-uuid-1');

      expect(result).toEqual(plans);
      expect(prisma.treatmentPlan.findMany).toHaveBeenCalledWith({
        where: { clinic_id: clinicId, patient_id: 'patient-uuid-1' },
        orderBy: { created_at: 'desc' },
        include: {
          patient: { select: { name: true } },
          odontogram: true,
        },
      });
    });

    it('should return empty array when patient has no treatment plans', async () => {
      prisma.treatmentPlan.findMany.mockResolvedValue([]);

      const result = await service.findByPatient(clinicId, 'patient-uuid-2');

      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────
  // findById
  // ──────────────────────────────────────────────────
  describe('findById', () => {
    it('should return a treatment plan by id and clinic_id', async () => {
      prisma.treatmentPlan.findFirst.mockResolvedValue(mockPlan);

      const result = await service.findById(clinicId, 'plan-uuid-1');

      expect(result).toEqual(mockPlan);
      expect(prisma.treatmentPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-1', clinic_id: clinicId },
        include: {
          patient: { select: { name: true } },
          odontogram: true,
        },
      });
    });

    it('should throw NotFoundException when plan is not found', async () => {
      prisma.treatmentPlan.findFirst.mockResolvedValue(null);

      await expect(service.findById(clinicId, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ──────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────
  describe('update', () => {
    const updateDto = {
      patient_summary: 'Paciente atualizado',
      total_cost: 2000,
      total_sessions: 8,
      recommendations: 'Nova recomendacao',
      notes: 'Notas adicionais',
    };

    it('should update a treatment plan and log audit', async () => {
      const updatedPlan = {
        ...mockPlan,
        ...updateDto,
        updated_at: new Date('2025-02-01'),
      };
      prisma.treatmentPlan.findFirst.mockResolvedValue(mockPlan);
      prisma.treatmentPlan.update.mockResolvedValue(updatedPlan);

      const result = await service.update(clinicId, 'plan-uuid-1', updateDto as any, userId);

      expect(result).toEqual(updatedPlan);
      expect(prisma.treatmentPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-1', clinic_id: clinicId },
        include: {
          patient: { select: { name: true } },
          odontogram: true,
        },
      });
      expect(prisma.treatmentPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-1' },
        data: {
          patient_id: undefined,
          patient_summary: updateDto.patient_summary,
          phases: undefined,
          total_cost: updateDto.total_cost,
          total_sessions: updateDto.total_sessions,
          recommendations: updateDto.recommendations,
          odontogram_id: undefined,
          notes: updateDto.notes,
          status: undefined,
        },
        include: {
          patient: { select: { name: true } },
          odontogram: true,
        },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'UPDATE',
        entity: 'TreatmentPlan',
        entityId: 'plan-uuid-1',
        clinicId,
        userId,
        oldValues: mockPlan,
        newValues: updatedPlan,
      });
    });

    it('should throw NotFoundException when updating a non-existent plan', async () => {
      prisma.treatmentPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.update(clinicId, 'non-existent-id', updateDto as any, userId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.treatmentPlan.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should update with phases as Prisma.InputJsonValue when provided', async () => {
      const dtoWithPhases = {
        ...updateDto,
        phases: [{ name: 'Fase 2', procedures: ['Limpeza'] }],
      };
      const updatedPlan = {
        ...mockPlan,
        ...dtoWithPhases,
      };
      prisma.treatmentPlan.findFirst.mockResolvedValue(mockPlan);
      prisma.treatmentPlan.update.mockResolvedValue(updatedPlan);

      await service.update(clinicId, 'plan-uuid-1', dtoWithPhases as any, userId);

      expect(prisma.treatmentPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phases: dtoWithPhases.phases,
          }),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────
  // updateStatus
  // ──────────────────────────────────────────────────
  describe('updateStatus', () => {
    it('should update status and log audit with UPDATE_STATUS action', async () => {
      const updatedPlan = {
        ...mockPlan,
        status: 'in_progress',
        updated_at: new Date('2025-02-01'),
      };
      prisma.treatmentPlan.findFirst.mockResolvedValue(mockPlan);
      prisma.treatmentPlan.update.mockResolvedValue(updatedPlan);

      const result = await service.updateStatus(clinicId, 'plan-uuid-1', 'in_progress', userId);

      expect(result).toEqual(updatedPlan);
      expect(prisma.treatmentPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-1', clinic_id: clinicId },
        include: {
          patient: { select: { name: true } },
          odontogram: true,
        },
      });
      expect(prisma.treatmentPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-1' },
        data: { status: 'in_progress' },
        include: {
          patient: { select: { name: true } },
          odontogram: true,
        },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'UPDATE_STATUS',
        entity: 'TreatmentPlan',
        entityId: 'plan-uuid-1',
        clinicId,
        userId,
        oldValues: { status: 'pending' },
        newValues: { status: 'in_progress' },
      });
    });

    it('should throw NotFoundException when updating status of a non-existent plan', async () => {
      prisma.treatmentPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(clinicId, 'non-existent-id', 'completed', userId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.treatmentPlan.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should update to completed status', async () => {
      const completedPlan = {
        ...mockPlan,
        status: 'completed',
      };
      prisma.treatmentPlan.findFirst.mockResolvedValue(mockPlan);
      prisma.treatmentPlan.update.mockResolvedValue(completedPlan);

      const result = await service.updateStatus(clinicId, 'plan-uuid-1', 'completed', userId);

      expect(result.status).toBe('completed');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_STATUS',
          newValues: { status: 'completed' },
        }),
      );
    });

    it('should update to cancelled status', async () => {
      const cancelledPlan = {
        ...mockPlan,
        status: 'cancelled',
      };
      prisma.treatmentPlan.findFirst.mockResolvedValue(mockPlan);
      prisma.treatmentPlan.update.mockResolvedValue(cancelledPlan);

      const result = await service.updateStatus(clinicId, 'plan-uuid-1', 'cancelled', userId);

      expect(result.status).toBe('cancelled');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_STATUS',
          oldValues: { status: 'pending' },
          newValues: { status: 'cancelled' },
        }),
      );
    });
  });
});
