import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let pdfGenerator: { generatePdf: jest.Mock };

  const clinicId = 'clinic-uuid-1';

  const mockPrescription = {
    id: 'prescription-uuid-1',
    clinic_id: clinicId,
    patient_id: 'patient-uuid-1',
    dentist_id: 'dentist-uuid-1',
    type: 'prescription',
    content: {
      medications: [
        {
          name: 'Amoxicilina 500mg',
          dosage: '1 comprimido',
          frequency: '8/8h',
          duration: '7 dias',
          notes: 'Tomar apos as refeicoes',
        },
      ],
    },
    pdf_url: null,
    sent_at: null,
    sent_via: null,
    deleted_at: null,
    created_at: new Date('2025-07-01'),
    updated_at: new Date('2025-07-01'),
    patient: { name: 'Maria Silva', phone: '11999999999', cpf: '12345678900' },
    dentist: { name: 'Dr. Carlos', cro: 'CRO-SP-12345' },
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    pdfGenerator = {
      generatePdf: jest.fn().mockResolvedValue('/uploads/prescriptions/clinic-uuid-1/prescription-uuid-1.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfGeneratorService, useValue: pdfGenerator },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated prescriptions with deleted_at: null', async () => {
      const prescriptions = [mockPrescription];
      prisma.prescription.findMany.mockResolvedValue(prescriptions);
      prisma.prescription.count.mockResolvedValue(1);

      const result = await service.findAll(clinicId, 1, 20);

      expect(result).toEqual({
        data: prescriptions,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
      expect(prisma.prescription.findMany).toHaveBeenCalledWith({
        where: { clinic_id: clinicId, deleted_at: null },
        orderBy: { created_at: 'desc' },
        skip: 0,
        take: 20,
        include: {
          patient: { select: { name: true } },
          dentist: { select: { name: true, cro: true } },
        },
      });
      expect(prisma.prescription.count).toHaveBeenCalledWith({
        where: { clinic_id: clinicId, deleted_at: null },
      });
    });

    it('should cap limit at 100', async () => {
      prisma.prescription.findMany.mockResolvedValue([]);
      prisma.prescription.count.mockResolvedValue(0);

      const result = await service.findAll(clinicId, 1, 500);

      expect(result.meta.limit).toBe(100);
      expect(prisma.prescription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should handle pagination correctly', async () => {
      prisma.prescription.findMany.mockResolvedValue([]);
      prisma.prescription.count.mockResolvedValue(50);

      const result = await service.findAll(clinicId, 3, 10);

      expect(result.meta).toEqual({
        total: 50,
        page: 3,
        limit: 10,
        totalPages: 5,
      });
      expect(prisma.prescription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  // ──────────────────────────────────────────────────
  // findByPatient
  // ──────────────────────────────────────────────────
  describe('findByPatient', () => {
    it('should return prescriptions for a specific patient', async () => {
      const prescriptions = [mockPrescription];
      prisma.prescription.findMany.mockResolvedValue(prescriptions);

      const result = await service.findByPatient(clinicId, 'patient-uuid-1');

      expect(result).toEqual(prescriptions);
      expect(prisma.prescription.findMany).toHaveBeenCalledWith({
        where: {
          clinic_id: clinicId,
          patient_id: 'patient-uuid-1',
          deleted_at: null,
        },
        orderBy: { created_at: 'desc' },
        include: {
          dentist: { select: { name: true, cro: true } },
        },
      });
    });

    it('should return empty array when patient has no prescriptions', async () => {
      prisma.prescription.findMany.mockResolvedValue([]);

      const result = await service.findByPatient(clinicId, 'patient-uuid-2');

      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      patient_id: 'patient-uuid-1',
      dentist_id: 'dentist-uuid-1',
      type: 'prescription',
      content: {
        medications: [
          {
            name: 'Ibuprofeno 600mg',
            dosage: '1 comprimido',
            frequency: '12/12h',
            duration: '3 dias',
          },
        ],
      },
    };

    it('should create a prescription and trigger PDF generation', async () => {
      const createdPrescription = {
        ...mockPrescription,
        id: 'new-prescription-uuid',
        content: createDto.content,
      };
      prisma.prescription.create.mockResolvedValue(createdPrescription);

      const result = await service.create(clinicId, createDto as any);

      expect(result).toEqual(createdPrescription);
      expect(prisma.prescription.create).toHaveBeenCalledWith({
        data: {
          clinic_id: clinicId,
          patient_id: createDto.patient_id,
          dentist_id: createDto.dentist_id,
          type: createDto.type,
          content: createDto.content,
        },
        include: {
          patient: { select: { name: true, phone: true, cpf: true } },
          dentist: { select: { name: true, cro: true } },
        },
      });
      // PDF generation is called in background (fire-and-forget)
      expect(pdfGenerator.generatePdf).toHaveBeenCalledWith(
        createdPrescription.id,
        clinicId,
      );
    });
  });

  // ──────────────────────────────────────────────────
  // delete (soft delete)
  // ──────────────────────────────────────────────────
  describe('delete', () => {
    it('should soft delete a prescription by setting deleted_at', async () => {
      prisma.prescription.findFirst.mockResolvedValue(mockPrescription);
      const deletedPrescription = {
        ...mockPrescription,
        deleted_at: new Date('2025-08-01'),
      };
      prisma.prescription.update.mockResolvedValue(deletedPrescription);

      const result = await service.delete(clinicId, mockPrescription.id);

      expect(result.deleted_at).toBeDefined();
      expect(prisma.prescription.findFirst).toHaveBeenCalledWith({
        where: { id: mockPrescription.id, clinic_id: clinicId, deleted_at: null },
      });
      expect(prisma.prescription.update).toHaveBeenCalledWith({
        where: { id: mockPrescription.id },
        data: { deleted_at: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if prescription not found', async () => {
      prisma.prescription.findFirst.mockResolvedValue(null);

      await expect(
        service.delete(clinicId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.prescription.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // restore
  // ──────────────────────────────────────────────────
  describe('restore', () => {
    it('should restore a soft-deleted prescription', async () => {
      const deletedPrescription = {
        ...mockPrescription,
        deleted_at: new Date('2025-08-01'),
      };
      prisma.prescription.findFirst.mockResolvedValue(deletedPrescription);
      const restoredPrescription = {
        ...mockPrescription,
        deleted_at: null,
      };
      prisma.prescription.update.mockResolvedValue(restoredPrescription);

      const result = await service.restore(clinicId, mockPrescription.id);

      expect(result.deleted_at).toBeNull();
      expect(prisma.prescription.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockPrescription.id,
          clinic_id: clinicId,
          deleted_at: { not: null },
        },
      });
      expect(prisma.prescription.update).toHaveBeenCalledWith({
        where: { id: mockPrescription.id },
        data: { deleted_at: null },
      });
    });

    it('should throw NotFoundException when prescription not found or not deleted', async () => {
      prisma.prescription.findFirst.mockResolvedValue(null);

      await expect(
        service.restore(clinicId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.prescription.update).not.toHaveBeenCalled();
    });
  });
});
