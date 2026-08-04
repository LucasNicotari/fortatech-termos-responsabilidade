import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = {
    $queryRaw: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('reports liveness without querying the database', () => {
    const controller = new HealthController(prisma as never);

    expect(controller.live()).toEqual(expect.objectContaining({
      status: 'ok',
      revision: expect.any(String),
      uptimeSeconds: expect.any(Number)
    }));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('checks the database for readiness', async () => {
    const controller = new HealthController(prisma as never);

    await expect(controller.readyCheck()).resolves.toEqual(expect.objectContaining({
      status: 'ok',
      database: 'reachable'
    }));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
