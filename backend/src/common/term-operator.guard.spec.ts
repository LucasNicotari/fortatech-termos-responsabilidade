import { ForbiddenException } from '@nestjs/common';
import { TermOperatorGuard } from './term-operator.guard';

describe('TermOperatorGuard', () => {
  const guard = new TermOperatorGuard({
    canOperate: (id?: string) => Promise.resolve(id === '8243' || id === '8465')
  } as never);

  function context(bitrixUserId?: string) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user: { bitrixUserId } }) })
    } as never;
  }

  it.each(['8243', '8465'])('permite o operador %s', async (id) => {
    await expect(guard.canActivate(context(id))).resolves.toBe(true);
  });

  it('bloqueia qualquer outro usuario', async () => {
    await expect(guard.canActivate(context('8137'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
