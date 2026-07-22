import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSendRequestDto } from './create-send-request.dto';

const validRequest = {
  employeeBitrixUserId: 123,
  employeeName: 'Colaborador Teste',
  employeeEmail: 'colaborador@example.com',
  cpf: '000.000.000-00',
  departamento: 'Tecnologia',
  equipment: [{ quantity: 1, description: 'Notebook' }]
};

describe('CreateSendRequestDto', () => {
  it('requires the department resolved from Bitrix24', async () => {
    const dto = plainToInstance(CreateSendRequestDto, { ...validRequest, departamento: '' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'departamento')).toBe(true);
  });

  it('accepts the reduced form when all required fields are present', async () => {
    const dto = plainToInstance(CreateSendRequestDto, validRequest);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
