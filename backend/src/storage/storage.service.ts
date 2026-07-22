import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, normalize, resolve } from 'path';

@Injectable()
export class StorageService {
  readonly bucket = 'responsibility-terms';
  private readonly client?: SupabaseClient;
  private readonly driver: 'supabase' | 'local';
  private readonly localRoot: string;
  private readonly publicBackendUrl: string;
  private readonly signingKey: string;
  private bucketReady?: Promise<void>;

  constructor(config: ConfigService) {
    this.driver = config.get<string>('STORAGE_DRIVER') === 'local' ? 'local' : 'supabase';
    this.localRoot = resolve(config.get<string>('LOCAL_STORAGE_PATH') || '../.data/storage');
    this.publicBackendUrl = (config.get<string>('PUBLIC_BACKEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
    this.signingKey = config.get<string>('LOCAL_STORAGE_SIGNING_KEY') || config.get<string>('JWT_SECRET') || '';
    const url = config.get<string>('SUPABASE_URL');
    const key = config.get<string>('SUPABASE_SECRET_KEY');
    if (url && key) {
      this.client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    }
  }

  async upload(path: string, contents: Buffer, contentType: string, upsert = false) {
    await this.ensureBucket();
    if (this.driver === 'local') {
      const target = this.localFile(path);
      await mkdir(resolve(target, '..'), { recursive: true });
      if (!upsert) {
        try {
          await readFile(target);
          throw new BadRequestException('Arquivo local ja existe');
        } catch (error) {
          if (error instanceof BadRequestException) throw error;
        }
      }
      await writeFile(target, contents);
      return path;
    }
    const { error } = await this.client!.storage.from(this.bucket).upload(path, contents, {
      contentType,
      cacheControl: 'private, max-age=0',
      upsert
    });
    if (error) throw new ServiceUnavailableException(`Falha no Supabase Storage: ${error.message}`);
    return path;
  }

  async download(path: string) {
    await this.ensureBucket();
    if (this.driver === 'local') return readFile(this.localFile(path));
    const { data, error } = await this.client!.storage.from(this.bucket).download(path);
    if (error || !data) throw new ServiceUnavailableException(`Falha ao baixar do Supabase Storage: ${error?.message || 'arquivo ausente'}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(path: string) {
    await this.ensureBucket();
    if (this.driver === 'local') {
      try {
        await unlink(this.localFile(path));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      return;
    }
    const { error } = await this.client!.storage.from(this.bucket).remove([path]);
    if (error) throw new ServiceUnavailableException(`Falha ao remover arquivo do Supabase Storage: ${error.message}`);
  }

  async createSignedUrl(path: string, expiresIn = 300) {
    await this.ensureBucket();
    if (this.driver === 'local') {
      const expires = Math.floor(Date.now() / 1000) + expiresIn;
      const signature = this.sign(path, expires);
      const query = new URLSearchParams({ path, expires: String(expires), signature });
      return `${this.publicBackendUrl}/storage/local?${query.toString()}`;
    }
    const { data, error } = await this.client!.storage.from(this.bucket).createSignedUrl(path, expiresIn, { download: true });
    if (error || !data) throw new ServiceUnavailableException(`Falha ao assinar URL: ${error?.message || 'sem URL'}`);
    return data.signedUrl;
  }

  async ensureBucket() {
    if (this.driver === 'local') {
      await mkdir(this.localRoot, { recursive: true });
      return;
    }
    if (!this.client) {
      throw new ServiceUnavailableException('SUPABASE_URL e SUPABASE_SECRET_KEY nao configurados');
    }
    if (!this.bucketReady) {
      this.bucketReady = this.initializeBucket().catch((error) => {
        this.bucketReady = undefined;
        throw error;
      });
    }
    await this.bucketReady;
  }

  private async initializeBucket() {
    const { data, error } = await this.client!.storage.getBucket(this.bucket);
    if (!error && data) {
      if (data.public) throw new ServiceUnavailableException('O bucket responsibility-terms precisa ser privado');
      return;
    }
    const created = await this.client!.storage.createBucket(this.bucket, {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    });
    if (created.error) throw new ServiceUnavailableException(`Nao foi possivel criar bucket privado: ${created.error.message}`);
  }

  async readSignedLocalFile(path: string, expires: number, signature: string) {
    if (this.driver !== 'local') throw new BadRequestException('Storage local nao habilitado');
    if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
      throw new BadRequestException('URL expirada');
    }
    const expected = Buffer.from(this.sign(path, expires), 'hex');
    const received = Buffer.from(signature || '', 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new BadRequestException('Assinatura de URL invalida');
    }
    return { contents: await readFile(this.localFile(path)), fileName: path.split('/').pop() || 'documento' };
  }

  private sign(path: string, expires: number) {
    if (!this.signingKey || this.signingKey.length < 32) {
      throw new ServiceUnavailableException('LOCAL_STORAGE_SIGNING_KEY ou JWT_SECRET precisa ter ao menos 32 caracteres');
    }
    return createHmac('sha256', this.signingKey).update(`${path}\n${expires}`).digest('hex');
  }

  private localFile(path: string) {
    const safe = normalize(path.replace(/\\/g, '/'));
    if (!safe || safe === '.' || safe.startsWith('..') || isAbsolute(safe)) {
      throw new BadRequestException('Caminho de arquivo invalido');
    }
    const target = resolve(join(this.localRoot, safe));
    if (target !== this.localRoot && !target.startsWith(`${this.localRoot}\\`) && !target.startsWith(`${this.localRoot}/`)) {
      throw new BadRequestException('Caminho de arquivo invalido');
    }
    return target;
  }
}
