import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService currentSession', () => {
  const prisma = {
    user: {
      findUnique: jest.fn()
    }
  };
  const workflow = {
    canOperate: jest.fn()
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    {} as never,
    workflow as never
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a fresh active user and current operation permission', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Operador',
      email: 'operador@example.com',
      role: UserRole.ADMIN,
      bitrixUserId: '42',
      active: true
    });
    workflow.canOperate.mockResolvedValue(true);

    await expect(service.currentSession('user-1')).resolves.toEqual({
      id: 'user-1',
      name: 'Operador',
      email: 'operador@example.com',
      role: UserRole.ADMIN,
      bitrixUserId: '42',
      canOperate: true
    });
    expect(workflow.canOperate).toHaveBeenCalledWith('42');
  });

  it('rejects a user whose access was disabled after login', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      active: false
    });

    await expect(service.currentSession('user-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(workflow.canOperate).not.toHaveBeenCalled();
  });
});
