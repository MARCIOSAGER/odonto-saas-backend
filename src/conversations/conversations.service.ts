import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface FindAllOptions {
  page?: number;
  limit?: number;
}

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(clinicId: string, options: FindAllOptions = {}) {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 20;
    const skip = Math.max(0, (page - 1) * limit);

    // Buscar conversas agrupadas por telefone com a última mensagem
    const conversations = await this.prisma.$queryRaw<
      Array<{
        phone: string;
        patient_id: string | null;
        patient_name: string | null;
        last_message: string;
        last_message_at: Date;
        unread_count: number;
        total_messages: number;
      }>
    >`
      SELECT
        wm.phone,
        wm.patient_id,
        p.name as patient_name,
        (
          SELECT message FROM "WhatsAppMessage"
          WHERE phone = wm.phone AND clinic_id = ${clinicId}
          ORDER BY created_at DESC LIMIT 1
        ) as last_message,
        MAX(wm.created_at) as last_message_at,
        COUNT(CASE WHEN wm.direction = 'incoming' AND wm.status = 'sent' THEN 1 END)::int as unread_count,
        COUNT(*)::int as total_messages
      FROM "WhatsAppMessage" wm
      LEFT JOIN "Patient" p ON wm.patient_id = p.id
      WHERE wm.clinic_id = ${clinicId}
      GROUP BY wm.phone, wm.patient_id, p.name
      ORDER BY last_message_at DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    // Contar total de conversas distintas
    const totalResult = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT phone)::int as count
      FROM "WhatsAppMessage"
      WHERE clinic_id = ${clinicId}
    `;
    const total = Number(totalResult[0]?.count || 0);

    return {
      data: conversations.map((conv) => ({
        phone: conv.phone,
        patient_id: conv.patient_id,
        patient_name: conv.patient_name || 'Desconhecido',
        last_message: conv.last_message,
        last_message_at: conv.last_message_at,
        unread_count: conv.unread_count,
        total_messages: conv.total_messages,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByPhone(clinicId: string, phone: string, options: FindAllOptions = {}) {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 50;
    const skip = Math.max(0, (page - 1) * limit);

    // Normalizar telefone (remover caracteres não numéricos)
    const normalizedPhone = phone.replace(/\D/g, '');

    // Buscar mensagens da conversa
    const [messages, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where: {
          clinic_id: clinicId,
          phone: { contains: normalizedPhone },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          patient: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.whatsAppMessage.count({
        where: {
          clinic_id: clinicId,
          phone: { contains: normalizedPhone },
        },
      }),
    ]);

    if (messages.length === 0) {
      throw new NotFoundException('Conversation not found');
    }

    // Buscar informações do paciente se existir
    const patient = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone: { contains: normalizedPhone },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        last_visit: true,
        _count: {
          select: { appointments: true },
        },
      },
    });

    return {
      patient,
      data: messages.reverse(), // Ordenar do mais antigo para o mais recente
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(clinicId: string, phone: string) {
    const normalizedPhone = phone.replace(/\D/g, '');

    await this.prisma.whatsAppMessage.updateMany({
      where: {
        clinic_id: clinicId,
        phone: { contains: normalizedPhone },
        direction: 'incoming',
        status: 'sent',
      },
      data: {
        status: 'read',
      },
    });

    return { success: true };
  }
}
