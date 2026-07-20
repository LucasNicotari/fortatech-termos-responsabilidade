export type SignatureStatus = 'PENDING' | 'SENT' | 'VIEWED' | 'IN_PROGRESS' | 'SIGNED' | 'FINISHED' | 'DECLINED' | 'ERROR' | 'CANCELED';
export type SendRequestStatus = 'DRAFT' | 'READY' | 'PENDING' | 'SENDING' | 'SENT' | 'IN_PROGRESS' | 'DECLINED' | 'FAILED' | 'CANCELED';

export interface Employee {
  id: string;
  bitrixId?: string;
  nome: string;
  email: string;
  cpf?: string;
  empresa?: string;
  cargo?: string;
  departamento?: string;
  status: string;
  invitationStatus?: string;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  nome: string;
  versao: string;
  descricao?: string;
  templateVersionId?: string;
  isDefault?: boolean;
  ativo: boolean;
  createdAt: string;
}

export interface SendRequest {
  id: string;
  employee?: Employee;
  employeeId: string;
  templateVersionId: string;
  templateVersion?: {
    id: string;
    versao: string;
    template: {
      nome: string;
    };
  };
  triggerType: string;
  status: SendRequestStatus;
  scheduledAt?: string;
  requestedAt: string;
  sentAt?: string;
  failureReason?: string;
  documentFileName?: string;
  unsignedSha256?: string;
  equipment?: Equipment[];
  createdAt: string;
  updatedAt: string;
}

export interface Signature {
  id: string;
  employee?: Employee;
  employeeId: string;
  bitrixDocumentId?: string;
  bitrixDocumentUid?: string;
  bitrixSignId?: string;
  status: SignatureStatus;
  bitrixStage?: string;
  rawStatusCode?: string;
  archiveStatus?: 'NOT_REQUIRED' | 'PENDING' | 'ARCHIVED' | 'FAILED';
  archiveError?: string;
  sendRequest?: SendRequest;
  sentAt?: string;
  signedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Equipment {
  id?: string;
  itemNumber?: number;
  quantity: number;
  description: string;
  serialNumber?: string;
  assetTag?: string;
  accessories?: string;
}

export interface BitrixEmployee {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  EMAIL?: string;
  WORK_POSITION?: string;
}

export interface IntegrationLog {
  id: string;
  type: string;
  source: string;
  endpoint?: string;
  payload?: unknown;
  response?: unknown;
  error?: string;
  createdAt: string;
}

export interface DashboardSummary {
  totalEmployees: number;
  pending: number;
  sent: number;
  signed: number;
  errors: number;
  latestEvents: Array<{ id: string; eventType?: string; processed: boolean; error?: string; createdAt: string }>;
  latestSignatures: Signature[];
  byStatus: Array<{ status: SignatureStatus; total: number }>;
}
