import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.employee.findMany({
      orderBy: { createdAt: 'desc' },
      include: { signatures: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { signatures: true }
    });
    if (!employee) {
      throw new NotFoundException('Colaborador não encontrado');
    }
    return employee;
  }

  create(dto: CreateEmployeeDto) {
    return this.prisma.employee.create({ data: this.normalizeDates(dto) });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    return this.prisma.employee.update({ where: { id }, data: this.normalizeDates(dto) });
  }

  private normalizeDates<T extends CreateEmployeeDto | UpdateEmployeeDto>(dto: T) {
    return {
      ...dto,
      acceptedAt: dto.acceptedAt ? new Date(dto.acceptedAt) : undefined
    };
  }
}
