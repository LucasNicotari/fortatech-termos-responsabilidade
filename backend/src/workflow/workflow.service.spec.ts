import { WorkflowService } from './workflow.service';

describe('WorkflowService', () => {
  it('returns only users with access or notifications in the settings list', async () => {
    const service = new WorkflowService(
      {
        termWorkflowParticipant: {
          findMany: jest.fn().mockResolvedValue([
            { bitrixUserId: '1', canOperate: true, receiveNotifications: false }
          ])
        },
        user: {
          findMany: jest.fn().mockResolvedValue([
            { bitrixUserId: '1', active: true, role: 'TI' }
          ])
        }
      } as never,
      { getUserWithDepartment: jest.fn().mockResolvedValue(
        { ID: '1', NAME: 'Alvaro', ACTIVE: true, PERSONAL_PHOTO: 'https://portal.example/avatar/1.jpg' }
      ) } as never,
      {} as never
    );

    const matrix = await service.matrix();

    expect(matrix.map((item) => item.name)).toEqual(['Alvaro']);
    expect(matrix[0]).toMatchObject({
      bitrixUserId: 1,
      hasAccess: true,
      role: 'TI',
      canOperate: true,
      receiveNotifications: false
    });
  });

  it('filters candidates ignoring accents', async () => {
    const service = new WorkflowService(
      {
        termWorkflowParticipant: { findMany: jest.fn().mockResolvedValue([]) },
        user: { findMany: jest.fn().mockResolvedValue([]) }
      } as never,
      { listEmployeesWithDepartments: jest.fn().mockResolvedValue([
        { ID: '1', NAME: 'Álvaro', ACTIVE: true, DEPARTMENT_NAME: 'Tecnologia' },
        { ID: '2', NAME: 'Beatriz', ACTIVE: true, DEPARTMENT_NAME: 'Financeiro' }
      ]) } as never,
      {} as never
    );

    await expect(service.candidates('alvaro')).resolves.toEqual([
      expect.objectContaining({ bitrixUserId: 1, name: 'Álvaro' })
    ]);
  });

  it('allows an empty notification list after settings were persisted', async () => {
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

  it('uses environment defaults only before the first persisted configuration', async () => {
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
