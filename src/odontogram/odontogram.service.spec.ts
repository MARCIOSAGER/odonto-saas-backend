import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OdontogramService } from './odontogram.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('OdontogramService', () => {
  let service: OdontogramService;
  let prisma: ReturnType<typeof createPrismaMock>;

  const clinicId = 'clinic-uuid-1';
  const patientId = 'patient-uuid-1';

  const mockPatient = { id: patientId, clinic_id: clinicId, name: 'Maria' };

  const mockOdontogram = {
    id: 'odonto-uuid-1',
    patient_id: patientId,
    teeth: [],
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
  };

  const mockTooth = {
    id: 'tooth-uuid-1',
    odontogram_id: 'odonto-uuid-1',
    tooth_number: 36,
    status: 'caries',
    surfaces: { mesial: 'caries' },
    notes: 'Carie profunda',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OdontogramService,
        { provide: PrismaService, useValue: prisma },
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
      expect(prisma.odontogram.findFirst).toHaveBeenCalledWith({
        where: { patient_id: patientId },
        include: {
          teeth: { orderBy: { tooth_number: 'asc' } },
        },
        orderBy: { created_at: 'desc' },
      });
      expect(prisma.odontogram.create).not.toHaveBeenCalled();
    });

    it('should create a new odontogram when none exists', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findFirst.mockResolvedValue(null);
      prisma.odontogram.create.mockResolvedValue(mockOdontogram);

      const result = await service.getOrCreate(clinicId, patientId);

      expect(result).toEqual(mockOdontogram);
      expect(prisma.odontogram.create).toHaveBeenCalledWith({
        data: { patient_id: patientId },
        include: {
          teeth: { orderBy: { tooth_number: 'asc' } },
        },
      });
    });
  });

  // ──────────────────────────────────────────────────
  // updateTooth
  // ──────────────────────────────────────────────────
  describe('updateTooth', () => {
    const dto = {
      tooth_number: 36,
      status: 'caries',
      surfaces: { mesial: 'caries' },
      notes: 'Carie profunda',
    };

    beforeEach(() => {
      // Setup getOrCreate to succeed
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findFirst.mockResolvedValue(mockOdontogram);
    });

    it('should upsert a tooth with all fields', async () => {
      prisma.odontogramTooth.upsert.mockResolvedValue(mockTooth);

      const result = await service.updateTooth(clinicId, patientId, dto);

      expect(result).toEqual(mockTooth);
      expect(prisma.odontogramTooth.upsert).toHaveBeenCalledWith({
        where: {
          odontogram_id_tooth_number: {
            odontogram_id: mockOdontogram.id,
            tooth_number: dto.tooth_number,
          },
        },
        update: {
          status: dto.status,
          surfaces: dto.surfaces,
          notes: dto.notes,
        },
        create: {
          odontogram_id: mockOdontogram.id,
          tooth_number: dto.tooth_number,
          status: dto.status,
          surfaces: dto.surfaces,
          notes: dto.notes,
        },
      });
    });

    it('should pass undefined for surfaces when not provided', async () => {
      const dtoWithoutSurfaces = {
        tooth_number: 36,
        status: 'healthy',
        notes: 'OK',
      };
      prisma.odontogramTooth.upsert.mockResolvedValue({
        ...mockTooth,
        status: 'healthy',
        surfaces: undefined,
        notes: 'OK',
      });

      await service.updateTooth(clinicId, patientId, dtoWithoutSurfaces);

      expect(prisma.odontogramTooth.upsert).toHaveBeenCalledWith({
        where: {
          odontogram_id_tooth_number: {
            odontogram_id: mockOdontogram.id,
            tooth_number: dtoWithoutSurfaces.tooth_number,
          },
        },
        update: {
          status: dtoWithoutSurfaces.status,
          surfaces: undefined,
          notes: dtoWithoutSurfaces.notes,
        },
        create: {
          odontogram_id: mockOdontogram.id,
          tooth_number: dtoWithoutSurfaces.tooth_number,
          status: dtoWithoutSurfaces.status,
          surfaces: undefined,
          notes: dtoWithoutSurfaces.notes,
        },
      });
    });

    it('should throw NotFoundException when patient not found', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTooth(clinicId, patientId, dto),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.odontogramTooth.upsert).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // updateTeeth
  // ──────────────────────────────────────────────────
  describe('updateTeeth', () => {
    const teethDtos = [
      {
        tooth_number: 36,
        status: 'caries',
        surfaces: { mesial: 'caries' },
        notes: 'Carie profunda',
      },
      {
        tooth_number: 11,
        status: 'restoration',
        notes: 'Restauracao antiga',
      },
    ];

    const mockTooth2 = {
      id: 'tooth-uuid-2',
      odontogram_id: 'odonto-uuid-1',
      tooth_number: 11,
      status: 'restoration',
      surfaces: undefined,
      notes: 'Restauracao antiga',
    };

    beforeEach(() => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findFirst.mockResolvedValue(mockOdontogram);
    });

    it('should upsert multiple teeth at once', async () => {
      prisma.odontogramTooth.upsert
        .mockResolvedValueOnce(mockTooth)
        .mockResolvedValueOnce(mockTooth2);

      const result = await service.updateTeeth(clinicId, patientId, teethDtos);

      expect(result).toEqual([mockTooth, mockTooth2]);
      expect(prisma.odontogramTooth.upsert).toHaveBeenCalledTimes(2);

      // First tooth call
      expect(prisma.odontogramTooth.upsert).toHaveBeenCalledWith({
        where: {
          odontogram_id_tooth_number: {
            odontogram_id: mockOdontogram.id,
            tooth_number: 36,
          },
        },
        update: {
          status: 'caries',
          surfaces: { mesial: 'caries' },
          notes: 'Carie profunda',
        },
        create: {
          odontogram_id: mockOdontogram.id,
          tooth_number: 36,
          status: 'caries',
          surfaces: { mesial: 'caries' },
          notes: 'Carie profunda',
        },
      });

      // Second tooth call
      expect(prisma.odontogramTooth.upsert).toHaveBeenCalledWith({
        where: {
          odontogram_id_tooth_number: {
            odontogram_id: mockOdontogram.id,
            tooth_number: 11,
          },
        },
        update: {
          status: 'restoration',
          surfaces: undefined,
          notes: 'Restauracao antiga',
        },
        create: {
          odontogram_id: mockOdontogram.id,
          tooth_number: 11,
          status: 'restoration',
          surfaces: undefined,
          notes: 'Restauracao antiga',
        },
      });
    });

    it('should return empty array when no teeth provided', async () => {
      const result = await service.updateTeeth(clinicId, patientId, []);

      expect(result).toEqual([]);
      expect(prisma.odontogramTooth.upsert).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when patient not found', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTeeth(clinicId, patientId, teethDtos),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.odontogramTooth.upsert).not.toHaveBeenCalled();
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

      expect(prisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: patientId, clinic_id: clinicId },
      });
      expect(prisma.odontogram.findMany).not.toHaveBeenCalled();
    });

    it('should return odontogram history ordered by created_at desc', async () => {
      const odontogram1 = {
        ...mockOdontogram,
        created_at: new Date('2025-01-01'),
      };
      const odontogram2 = {
        ...mockOdontogram,
        id: 'odonto-uuid-2',
        created_at: new Date('2025-06-01'),
      };
      const odontograms = [odontogram2, odontogram1];

      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findMany.mockResolvedValue(odontograms);

      const result = await service.getHistory(clinicId, patientId);

      expect(result).toEqual(odontograms);
      expect(prisma.odontogram.findMany).toHaveBeenCalledWith({
        where: { patient_id: patientId },
        include: {
          teeth: { orderBy: { tooth_number: 'asc' } },
        },
        orderBy: { created_at: 'desc' },
      });
    });

    it('should return empty array when no odontograms exist', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.odontogram.findMany.mockResolvedValue([]);

      const result = await service.getHistory(clinicId, patientId);

      expect(result).toEqual([]);
    });
  });
});
