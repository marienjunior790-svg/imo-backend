import { inject, injectable } from 'tsyringe';
import { ExpenseCategory } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import type { CreateExpenseDto, UpdateExpenseDto } from './building-expense.schema.js';

@injectable()
export class BuildingExpenseService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(organizationId: string, buildingId: string) {
    await this.assertBuilding(organizationId, buildingId);
    return this.prisma.buildingExpense.findMany({
      where: { organizationId, buildingId },
      orderBy: { incurredAt: 'desc' },
      include: {
        apartment: { select: { id: true, label: true } },
        maintenanceTicket: { select: { id: true, title: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async create(organizationId: string, buildingId: string, data: CreateExpenseDto, createdById?: string) {
    await this.assertBuilding(organizationId, buildingId);
    if (data.apartmentId) await this.assertApartment(organizationId, buildingId, data.apartmentId);
    if (data.maintenanceTicketId) {
      await this.assertTicket(organizationId, buildingId, data.maintenanceTicketId);
    }

    return this.prisma.buildingExpense.create({
      data: {
        organizationId,
        buildingId,
        amount: data.amount,
        category: data.category ?? ExpenseCategory.OTHER,
        incurredAt: new Date(data.incurredAt),
        description: data.description,
        vendor: data.vendor,
        apartmentId: data.apartmentId,
        maintenanceTicketId: data.maintenanceTicketId,
        currency: data.currency ?? 'XAF',
        createdById,
      },
      include: {
        apartment: { select: { id: true, label: true } },
        maintenanceTicket: { select: { id: true, title: true } },
      },
    });
  }

  async update(organizationId: string, buildingId: string, expenseId: string, data: UpdateExpenseDto) {
    const existing = await this.getOwned(organizationId, buildingId, expenseId);
    if (data.apartmentId) await this.assertApartment(organizationId, buildingId, data.apartmentId);
    if (data.maintenanceTicketId) {
      await this.assertTicket(organizationId, buildingId, data.maintenanceTicketId);
    }

    await this.prisma.buildingExpense.update({
      where: { id: existing.id },
      data: {
        ...(data.amount != null && { amount: data.amount }),
        ...(data.category && { category: data.category }),
        ...(data.incurredAt && { incurredAt: new Date(data.incurredAt) }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.vendor !== undefined && { vendor: data.vendor }),
        ...(data.apartmentId !== undefined && { apartmentId: data.apartmentId || null }),
        ...(data.maintenanceTicketId !== undefined && {
          maintenanceTicketId: data.maintenanceTicketId || null,
        }),
        ...(data.currency && { currency: data.currency }),
      },
    });

    return this.getOwned(organizationId, buildingId, expenseId);
  }

  async remove(organizationId: string, buildingId: string, expenseId: string) {
    const existing = await this.getOwned(organizationId, buildingId, expenseId);
    await this.prisma.buildingExpense.delete({ where: { id: existing.id } });
    return { id: existing.id };
  }

  private async assertBuilding(organizationId: string, buildingId: string) {
    const b = await this.prisma.building.findFirst({ where: { id: buildingId, organizationId } });
    if (!b) throw new NotFoundError('Immeuble introuvable');
    return b;
  }

  private async assertApartment(organizationId: string, buildingId: string, apartmentId: string) {
    const a = await this.prisma.apartment.findFirst({
      where: { id: apartmentId, organizationId, buildingId },
    });
    if (!a) throw new ValidationError('Logement introuvable dans cet immeuble');
  }

  private async assertTicket(organizationId: string, buildingId: string, ticketId: string) {
    const t = await this.prisma.maintenanceTicket.findFirst({
      where: { id: ticketId, organizationId, apartment: { buildingId } },
    });
    if (!t) throw new ValidationError('Ticket de maintenance introuvable pour cet immeuble');
  }

  private async getOwned(organizationId: string, buildingId: string, expenseId: string) {
    const e = await this.prisma.buildingExpense.findFirst({
      where: { id: expenseId, organizationId, buildingId },
      include: {
        apartment: { select: { id: true, label: true } },
        maintenanceTicket: { select: { id: true, title: true } },
      },
    });
    if (!e) throw new NotFoundError('Dépense introuvable');
    return e;
  }
}
