import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const allowedOrigins = (config.get<string>('CORS_ORIGINS') || config.get<string>('FRONTEND_URL') || '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true
  });
  const portalOrigin = config.get<string>('BITRIX_PORTAL_ORIGIN') || "'none'";
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.removeHeader('X-Frame-Options');
    response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' https://api.bitrix24.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors ${portalOrigin}; base-uri 'none'`);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fortatech Termos API')
    .setDescription('API para orquestrar Termos de Responsabilidade via Bitrix24')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = Number(config.get<string>('PORT') || config.get<string>('BACKEND_PORT') || 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
