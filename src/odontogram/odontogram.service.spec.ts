import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OdontogramService } from './odontogram.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock } from '../test/prisma-mock';
import { DentitionType, OdontogramEntryType, ToothSurface } from '@prisma/client';

describe('OdontogramService', () => {
  let service: OdontogramService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { log: jest.Mock };

  const clinicId = 'clinic-uuid-1';
  const patientId = 'patient-uuid-1';
  const userId = 'user-uuid-1';

  const mockPatient = { id: patientId, clinic_id: clinicId, name: 'Maria' };

  const mockOdontogram = {
    id: 'odonto-uuid-1',
    patient_id: patientId,
    clinic_id: clinicId,
    dentition_type: DentitionType.PERMANENT,
    entries: [],
    treatmentPlans: [],
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
  };

  const mockEntry = {
    id: 'entry-uuid-1',
    odontogram_id: 'odonto-uuid-1',
    tooth_number: 36,
    entry_type: OdontogramEntryType.FINDING,
    status_code: 'CARIES_SUSPECTED',
    surfaces: [ToothSurface.M, ToothSurface.D],
    notes: 'Carie profunda',
    created_by: userId,
    superseded_by: null,
    superseded_at: null,
    treatment_plan_item_id: null,
    created_at: new Date('2025-01-01'),
    treatmentPlanItem: null,
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OdontogramService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<OdontogramService>(OdontogramService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // getOrCreate
  // ──────────────────────────────────────────────────
  describe('getOrCreate', () => {
    it('should throw NotFoundException when patient does not belong to clinic', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.getOrCreate(clinicId, patientId)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: patientId, clinic_id: clinicId },
      });
      expect(prisma.odontogram.findFirst).not.toHaveBeenCalled();
    });

    it('should return existing odontogram when one exists', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findFirst.mockResolvedValue(mockOdontogram);

      const result = await service.getOrCreate(clinicId, patientId);

      expect(result).toEqual(mockOdontogram);
      expect(prisma.odontogram.create).not.toHaveBeenCalled();
    });

    it('should create a new odontogram when none exists', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findFirst.mockResolvedValue(null);
      prisma.odontogram.create.mockResolvedValue(mockOdontogram);

      const result = await service.getOrCreate(clinicId, patientId);

      expect(result).toEqual(mockOdontogram);
      expect(prisma.odontogram.create).toHaveBeenCalled();
    });

    it('should accept a specific dentition type', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findFirst.mockResolvedValue(null);
      prisma.odontogram.create.mockResolvedValue({
        ...mockOdontogram,
        dentition_type: DentitionType.DECIDUOUS,
      });

      const result = await service.getOrCreate(clinicId, patientId, DentitionType.DECIDUOUS);

      expect(result.dentition_type).toEqual(DentitionType.DECIDUOUS);
    });
  });

  // ──────────────────────────────────────────────────
  // getHistory
  // ──────────────────────────────────────────────────
  describe('getHistory', () => {
    it('should throw NotFoundException when patient does not belong to clinic', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.getHistory(clinicId, patientId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty result when no odontogram exists', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findFirst.mockResolvedValue(null);

      const result = await service.getHistory(clinicId, patientId);

      expect(result).toEqual({ data: [], meta: { total: 0, page: 1, limit: 50 } });
    });

    it('should return paginated entries', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findFirst.mockResolvedValue(mockOdontogram);
      prisma.odontogramEntry.findMany.mockResolvedValue([mockEntry]);
      prisma.odontogramEntry.count.mockResolvedValue(1);

      const result = await service.getHistory(clinicId, patientId, { page: 1, limit: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────
  // createEntry
  // ──────────────────────────────────────────────────
  describe('createEntry', () => {
    const dto = {
      tooth_number: 36,
      entry_type: OdontogramEntryType.FINDING,
      status_code: 'CARIES_SUSPECTED',
      surfaces: [ToothSurface.M] as ToothSurface[],
      notes: 'Carie profunda',
    };

    it('should throw NotFoundException when odontogram not found', async () => {
      prisma.odontogram.findFirst.mockResolvedValue(null);

      await expect(
        service.createEntry(clinicId, userId, 'non-existent', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create an entry and log audit', async () => {
      prisma.odontogram.findFirst.mockResolvedValue(mockOdontogram);
      prisma.treatmentPlan.findFirst.mockResolvedValue(null);
      prisma.treatmentPlan.create.mockResolvedValue({ id: 'tp-uuid-1' });
      prisma.treatmentPlanItem.create.mockResolvedValue({ id: 'tpi-uuid-1' });
      prisma.odontogramEntry.create.mockResolvedValue(mockEntry);

      const result = await service.createEntry(clinicId, userId, mockOdontogram.id, dto);

      expect(result).toEqual(mockEntry);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'OdontogramEntry',
        }),
      );
    });

    it('should auto-create treatment plan item for FINDING entries', async () => {
      prisma.odontogram.findFirst.mockResolvedValue(mockOdontogram);
      prisma.treatmentPlan.findFirst.mockResolvedValue(null);
      prisma.treatmentPlan.create.mockResolvedValue({ id: 'tp-uuid-1' });
      prisma.treatmentPlanItem.create.mockResolvedValue({ id: 'tpi-uuid-1' });
      prisma.odontogramEntry.create.mockResolvedValue(mockEntry);

      await service.createEntry(clinicId, userId, mockOdontogram.id, dto);

      expect(prisma.treatmentPlan.create).toHaveBeenCalled();
      expect(prisma.treatmentPlanItem.create).toHaveBeenCalled();
    });

    it('should not auto-create treatment plan item for HEALTHY findings', async () => {
      const healthyDto = { ...dto, status_code: 'HEALTHY' };
      prisma.odontogram.findFirst.mockResolvedValue(mockOdontogram);
      prisma.odontogramEntry.create.mockResolvedValue({
        ...mockEntry,
        status_code: 'HEALTHY',
      });

      await service.createEntry(clinicId, userId, mockOdontogram.id, healthyDto);

      expect(prisma.treatmentPlan.create).not.toHaveBeenCalled();
      expect(prisma.treatmentPlanItem.create).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // supersedeEntry
  // ──────────────────────────────────────────────────
  describe('supersedeEntry', () => {
    const existingEntry = {
      ...mockEntry,
      odontogram: mockOdontogram,
    };

    it('should throw NotFoundException when entry not found', async () => {
      prisma.odontogramEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.supersedeEntry(clinicId, userId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when entry belongs to different clinic', async () => {
      prisma.odontogramEntry.findFirst.mockResolvedValue({
        ...existingEntry,
        odontogram: { ...mockOdontogram, clinic_id: 'other-clinic' },
      });

      await expect(
        service.supersedeEntry(clinicId, userId, mockEntry.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when entry already superseded', async () => {
      prisma.odontogramEntry.findFirst.mockResolvedValue({
        ...existingEntry,
        superseded_at: new Date(),
      });

      await expect(
        service.supersedeEntry(clinicId, userId, mockEntry.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should supersede entry using transaction and log audit', async () => {
      const newEntry = { ...mockEntry, id: 'entry-uuid-2' };
      const oldUpdated = { ...mockEntry, superseded_by: newEntry.id, superseded_at: new Date() };

      prisma.odontogramEntry.findFirst.mockResolvedValue(existingEntry);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          odontogramEntry: {
            create: jest.fn().mockResolvedValue(newEntry),
            update: jest.fn().mockResolvedValue(oldUpdated),
          },
        });
      });

      const result = await service.supersedeEntry(clinicId, userId, mockEntry.id, { notes: 'Corrected' });

      expect(result.oldEntry).toBeDefined();
      expect(result.newEntry).toBeDefined();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERSEDE',
          entity: 'OdontogramEntry',
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────
  // getLegend
  // ──────────────────────────────────────────────────
  describe('getLegend', () => {
    it('should return existing legend items', async () => {
      const items = [{ code: 'HEALTHY', label: 'Saudavel', color: '#FFFFFF' }];
      prisma.odontogramLegendItem.findMany.mockResolvedValue(items);

      const result = await service.getLegend(clinicId);

      expect(result).toEqual(items);
    });

    it('should seed default legend when none exist', async () => {
      prisma.odontogramLegendItem.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ code: 'HEALTHY', label: 'Saudavel', color: '#FFFFFF' }]);
      prisma.odontogramLegendItem.createMany.mockResolvedValue({ count: 16 });

      const result = await service.getLegend(clinicId);

      expect(prisma.odontogramLegendItem.createMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────────
  // deleteLegend
  // ──────────────────────────────────────────────────
  describe('deleteLegend', () => {
    it('should throw NotFoundException when legend item not found', async () => {
      prisma.odontogramLegendItem.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteLegend(clinicId, 'NON_EXISTENT'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should soft delete by setting is_active to false', async () => {
      const item = { code: 'HEALTHY', is_active: true };
      prisma.odontogramLegendItem.findUnique.mockResolvedValue(item);
      prisma.odontogramLegendItem.update.mockResolvedValue({ ...item, is_active: false });

      const result = await service.deleteLegend(clinicId, 'HEALTHY');

      expect(result.is_active).toBe(false);
    });
  });
});
