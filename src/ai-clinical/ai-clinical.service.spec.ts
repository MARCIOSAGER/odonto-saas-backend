jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiClinicalService } from './ai-clinical.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('AiClinicalService', () => {
  let service: AiClinicalService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let configService: { get: jest.Mock };

  const clinicId = 'clinic-uuid-1';

  const mockSettings = {
    clinic_id: clinicId,
    ai_provider: 'anthropic',
    ai_api_key: 'test-key',
    ai_model: 'claude-3-5-haiku-20241022',
    ai_temperature: 0.3,
    max_tokens: 2000,
  };

  const mockPatient = {
    id: 'patient-uuid-1',
    name: 'Maria Silva',
    birth_date: new Date('1990-01-01'),
    notes: 'Sem obs',
  };

  const anthropicResponse = {
    data: {
      content: [{ text: '{"complaint":"Dor de dente","summary":"Resumo"}' }],
    },
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    // The service uses patient.findUnique which is not in the default mock
    (prisma.patient as any).findUnique = jest.fn();

    configService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiClinicalService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AiClinicalService>(AiClinicalService);

    // Default: clinic has AI settings configured
    prisma.clinicAiSettings.findUnique.mockResolvedValue(mockSettings);

    // Default: axios returns valid Anthropic response
    mockedAxios.post.mockResolvedValue(anthropicResponse);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // generateClinicalNotes
  // ──────────────────────────────────────────────────
  describe('generateClinicalNotes', () => {
    it('should generate notes with patient context', async () => {
      (prisma.patient as any).findUnique.mockResolvedValue(mockPatient);

      const result = await service.generateClinicalNotes(clinicId, {
        freeText: 'Paciente com dor no dente 36, carie profunda',
        patientId: mockPatient.id,
      });

      expect((prisma.patient as any).findUnique).toHaveBeenCalledWith({
        where: { id: mockPatient.id },
        select: { name: true, birth_date: true, notes: true },
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          model: mockSettings.ai_model,
          max_tokens: mockSettings.max_tokens,
          messages: [
            {
              role: 'user',
              content: expect.stringContaining('Maria Silva'),
            },
          ],
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-key',
          }),
        }),
      );

      expect(result).toEqual({ complaint: 'Dor de dente', summary: 'Resumo' });
    });

    it('should work without patient context', async () => {
      const result = await service.generateClinicalNotes(clinicId, {
        freeText: 'Limpeza de rotina realizada',
      });

      expect((prisma.patient as any).findUnique).not.toHaveBeenCalled();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: expect.stringContaining('Limpeza de rotina realizada'),
            },
          ],
        }),
        expect.any(Object),
      );

      expect(result).toEqual({ complaint: 'Dor de dente', summary: 'Resumo' });
    });
  });

  // ──────────────────────────────────────────────────
  // suggestTreatmentPlan
  // ──────────────────────────────────────────────────
  describe('suggestTreatmentPlan', () => {
    it('should return error if patient not found', async () => {
      (prisma.patient as any).findUnique.mockResolvedValue(null);
      prisma.odontogram.findFirst.mockResolvedValue(null);
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.service.findMany.mockResolvedValue([]);

      const result = await service.suggestTreatmentPlan(clinicId, 'non-existent-id');

      expect(result).toEqual({ error: 'Paciente não encontrado' });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should call AI with patient data', async () => {
      (prisma.patient as any).findUnique.mockResolvedValue(mockPatient);
      prisma.odontogram.findFirst.mockResolvedValue({
        id: 'odontogram-1',
        patient_id: mockPatient.id,
        updated_at: new Date(),
        entries: [
          {
            tooth_number: 36,
            status_code: 'CARIES_ACTIVE',
            entry_type: 'FINDING',
            surfaces: ['OI'],
            notes: 'Carie profunda',
          },
        ],
      });
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: 'appt-1',
          patient_id: mockPatient.id,
          date: new Date('2025-01-15'),
          status: 'completed',
          service: { name: 'Limpeza', price: 150 },
        },
      ]);
      prisma.service.findMany.mockResolvedValue([
        { name: 'Restauracao', price: 200, duration: 60 },
        { name: 'Limpeza', price: 150, duration: 30 },
      ]);

      const treatmentResponse = {
        data: {
          content: [
            {
              text: JSON.stringify({
                patientSummary: 'Paciente com carie no dente 36',
                phases: [],
                totalCost: 200,
                totalSessions: 1,
                recommendations: 'Tratar carie urgente',
              }),
            },
          ],
        },
      };
      mockedAxios.post.mockResolvedValue(treatmentResponse);

      const result = await service.suggestTreatmentPlan(clinicId, mockPatient.id);

      expect((prisma.patient as any).findUnique).toHaveBeenCalledWith({
        where: { id: mockPatient.id },
        select: { name: true, birth_date: true, notes: true },
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: expect.stringContaining('Maria Silva'),
            },
          ],
        }),
        expect.any(Object),
      );

      expect(result).toEqual(
        expect.objectContaining({
          patientSummary: 'Paciente com carie no dente 36',
          totalCost: 200,
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────
  // getPatientSummary
  // ──────────────────────────────────────────────────
  describe('getPatientSummary', () => {
    it('should return error if patient not found', async () => {
      (prisma.patient as any).findUnique.mockResolvedValue(null);
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.odontogram.findFirst.mockResolvedValue(null);

      const result = await service.getPatientSummary(clinicId, 'non-existent-id');

      expect(result).toEqual({ error: 'Paciente não encontrado' });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // processAnamnesis
  // ──────────────────────────────────────────────────
  describe('processAnamnesis', () => {
    it('should process answers and return AI analysis', async () => {
      const anamnesisResponse = {
        data: {
          content: [
            {
              text: JSON.stringify({
                riskClassification: 'ASA I',
                allergies: ['Penicilina'],
                medications: [],
                conditions: [],
                contraindications: [],
                alerts: [],
                warnings: ['Alergia a Penicilina'],
                notes: 'Paciente saudavel',
                recommendations: 'Evitar prescricao de penicilina',
              }),
            },
          ],
        },
      };
      mockedAxios.post.mockResolvedValue(anamnesisResponse);

      const result = await service.processAnamnesis(clinicId, {
        answers: {
          'Possui alergia a medicamentos?': 'Sim, penicilina',
          'Usa medicamentos regularmente?': 'Nao',
          'Possui doencas cronicas?': 'Nao',
        },
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: expect.stringContaining('penicilina'),
            },
          ],
        }),
        expect.any(Object),
      );

      expect(result).toEqual(
        expect.objectContaining({
          riskClassification: 'ASA I',
          allergies: ['Penicilina'],
          warnings: ['Alergia a Penicilina'],
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────
  // Error handling
  // ──────────────────────────────────────────────────
  describe('error handling', () => {
    it('should throw error when API key is not configured', async () => {
      // Simulate no clinic-level settings and no global key
      prisma.clinicAiSettings.findUnique.mockResolvedValue(null);
      configService.get.mockReturnValue(undefined);

      await expect(
        service.generateClinicalNotes(clinicId, {
          freeText: 'Exame de rotina',
        }),
      ).rejects.toThrow('API key não configurada. Configure nas configurações de IA.');
    });

    it('should handle AI API errors gracefully', async () => {
      mockedAxios.post.mockRejectedValue(
        new Error('Request failed with status code 500'),
      );

      await expect(
        service.generateClinicalNotes(clinicId, {
          freeText: 'Dor de dente',
        }),
      ).rejects.toThrow('Erro ao processar com IA. Tente novamente.');
    });
  });
});
