export type SignatureStatus = 'PENDING' | 'SENT' | 'VIEWED' | 'IN_PROGRESS' | 'SIGNED' | 'FINISHED' | 'DECLINED' | 'ERROR' | 'CANCELED';
export type SendRequestStatus = 'DRAFT' | 'READY' | 'PENDING' | 'SENDING' | 'SENT' | 'IN_PROGRESS' | 'DECLINED' | 'FAILED' | 'CANCELED';

export interface Employee {
  id: string;
  bitrixId?: string;
  nome: string;
  email: string;
  cpf?: string;
  cargo?: string;
  departamento?: string;
  createdAt: string;
  updatedAt: string;
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
  requestedAt: string;
  sentAt?: string;
  failureReason?: string;
  documentFileName?: string;
  unsignedSha256?: string;
  equipment?: Equipment[];
  signatures?: Signature[];
  createdAt: string;
  updatedAt: string;
}

export interface Signature {
  id: string;
  employee?: Employee;
  employeeId: string;
  provider?: 'BITRIX' | 'ZAPSIGN';
  providerDocumentId?: string;
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
  PERSONAL_PHOTO?: string;
  UF_DEPARTMENT?: number[];
  DEPARTMENT_NAME?: string;
  DEPARTMENT_LOOKUP_ERROR?: 'MISSING_SCOPE' | 'LOOKUP_FAILED';
}

export interface ActivityLog {
  id: string;
  actor: string;
  action: string;
  context?: string;
  status: 'SUCCESS' | 'ERROR';
  createdAt: string;
}

export interface DashboardSummary {
  totalEmployees: number;
  pending: number;
  sent: number;
  signed: number;
  errors: number;
  latestSignatures: Signature[];
}
