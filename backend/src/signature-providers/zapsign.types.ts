export interface ZapSignSigner {
  token: string;
  status: string;
  name: string;
  email?: string;
  times_viewed?: number;
  last_view_at?: string | null;
  signed_at?: string | null;
}

export interface ZapSignDocument {
  token: string;
  external_id?: string;
  status: string;
  name: string;
  original_file?: string | null;
  signed_file?: string | null;
  signers: ZapSignSigner[];
}

export interface CreateZapSignDocumentInput {
  externalId: string;
  fileName: string;
  pdf: Buffer;
  signer: {
    externalId: string;
    name: string;
    email: string;
    cpf: string;
  };
  observers?: string[];
}
