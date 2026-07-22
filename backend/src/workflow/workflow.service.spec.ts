import { WorkflowService } from './workflow.service';

describe('WorkflowService', () => {
  it('exibe somente usuarios ativos em ordem alfabetica pelo nome apresentado', async () => {
    const service = new WorkflowService(
      {
        termWorkflowParticipant: { findMany: jest.fn().mockResolvedValue([]) },
        user: { findMany: jest.fn().mockResolvedValue([]) }
      } as never,
      { listEmployeesWithDepartments: jest.fn().mockResolvedValue([
        { ID: '2', NAME: 'Zuleica', ACTIVE: false },
        { ID: '3', EMAIL: 'gabriel@example.com', ACTIVE: true },
        { ID: '1', NAME: 'Álvaro', ACTIVE: true, PERSONAL_PHOTO: 'https://portal.example/avatar/1.jpg' }
      ]) } as never,
      {} as never
    );

    const matrix = await service.matrix();

    expect(matrix.map((item) => item.name)).toEqual(['Álvaro', 'gabriel@example.com']);
    expect(matrix.find((item) => item.bitrixUserId === 1)?.photoUrl).toBe('https://portal.example/avatar/1.jpg');
    expect(matrix.find((item) => item.bitrixUserId === 1)).toMatchObject({
      hasAccess: false,
      role: 'RH',
      canOperate: false,
      receiveNotifications: false
    });
    expect(matrix.find((item) => item.bitrixUserId === 2)).toBeUndefined();
  });

  it('permite uma lista vazia de notificados depois que a configuracao foi persistida', async () => {
    const service = new WorkflowService(
      {
        termWorkflowParticipant: {
          count: jest.fn().mockResolvedValue(2),
          findMany: jest.fn().mockResolvedValue([])
        }
      } as never,
      {} as never,
      { get: jest.fn().mockReturnValue('7718,8137') } as never
    );

    await expect(service.notificationRecipientIds()).resolves.toEqual([]);
  });

  it('usa as variaveis apenas como contingencia antes da primeira configuracao', async () => {
    const service = new WorkflowService(
      {
        termWorkflowParticipant: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([])
        }
      } as never,
      {} as never,
      { get: jest.fn().mockImplementation((key: string) => key.includes('NOTIFICATION') ? '7718,8137' : '8243,8465') } as never
    );

    await expect(service.notificationRecipientIds()).resolves.toEqual([7718, 8137]);
    await expect(service.canOperate('8465')).resolves.toBe(true);
  });
});
