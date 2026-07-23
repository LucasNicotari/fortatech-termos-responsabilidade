export interface BitrixAuthPayload {
  access_token: string;
  refresh_token: string;
  expires_in?: number | string;
  scope?: string;
  domain: string;
  client_endpoint: string;
  server_endpoint: string;
  member_id: string;
  application_token?: string;
}

export interface BitrixUser {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  EMAIL?: string;
  WORK_POSITION?: string;
  PERSONAL_PHOTO?: string;
  UF_DEPARTMENT?: number[];
  DEPARTMENT_NAME?: string;
  DEPARTMENT_LOOKUP_ERROR?: 'MISSING_SCOPE' | 'LOOKUP_FAILED';
  ACTIVE?: boolean | 'Y' | 'N';
}

export interface BitrixDepartment {
  ID: string;
  NAME: string;
  PARENT?: string;
}

export interface BitrixEventHandler {
  event: string;
  handler: string;
  auth_type?: string;
  offline?: number;
}

export interface BitrixMember {
  uid: string;
  role: 'signer' | 'assignee' | 'reviewer' | 'editor';
  party: number;
  user?: { userId?: number };
  state?: { code: string; name: string };
}

export interface BitrixDocumentResult {
  uid: string;
  state: { code: string; name: string };
  members: BitrixMember[];
}

export interface BitrixCompanyProvider {
  code: string;
  uid: string;
  name: string;
  date?: string | null;
  expires?: string | null;
}

export interface SendBitrixDocumentInput {
  companyCrmId: number;
  signerUserId: number;
  representativeUserId: number;
  responsibleUserId: number;
  companyProviderUid: string;
  fileName: string;
  pdf: Buffer;
  regionDocumentType: string;
  externalId: string;
  externalDateCreate: Date;
}

export interface BitrixSafeDocument {
  id: number;
  title: string;
  create_date?: string;
  signed_date?: string;
  creator_id: number;
  member_id: number;
  role: string;
  file_url: string;
}

export interface BitrixDiskStorage {
  ID: string;
  NAME: string;
  ENTITY_TYPE: 'user' | 'common' | 'group' | string;
  ENTITY_ID: string;
  ROOT_OBJECT_ID: string;
}

export interface BitrixDiskObject {
  ID: string;
  NAME: string;
  STORAGE_ID: string;
  TYPE: 'file' | 'folder' | string;
  PARENT_ID?: string;
  DETAIL_URL?: string;
  DOWNLOAD_URL?: string;
}
