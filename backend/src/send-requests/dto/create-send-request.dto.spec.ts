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
  it('accepts a collaborator without email or department in the Bitrix24 profile', async () => {
    const dto = plainToInstance(CreateSendRequestDto, {
      employeeBitrixUserId: validRequest.employeeBitrixUserId,
      employeeName: validRequest.employeeName,
      cpf: validRequest.cpf,
      equipment: validRequest.equipment
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts the reduced form when all required fields are present', async () => {
    const dto = plainToInstance(CreateSendRequestDto, validRequest);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
