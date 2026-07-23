import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SigningJwtGuard extends AuthGuard('signing-jwt') {}
