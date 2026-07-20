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
  UF_DEPARTMENT?: number[];
  ACTIVE?: boolean;
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

export interface BitrixSendSignatureInput {
  externalId: string;
  fileName: string;
  pdf: Buffer;
  companyCrmId: number;
  employeeUserId: number;
  companySignerUserId: number;
  responsibleUserId: number;
  companyProviderUid: string;
  regionDocumentType: string;
}
