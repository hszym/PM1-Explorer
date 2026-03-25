// src/lib/types.ts

export interface Portfolio {
  id: number;
  pfNumber: string;
  description: string;
  portfolioTypeId: number;
  isConsolidated: boolean;
  isAggregated: boolean;
}

export interface DecodedToken {
  sub: string;
  name: string;
  userId: number;
  personId: number;
  iat: number;
  exp: number;
}

export interface AuthSession {
  token: string;
  decoded: DecodedToken;
  expiresAt: number; // ms epoch
}

// API response shapes (extend as Expersoft docs confirm)
export interface PositionRow {
  [key: string]: unknown;
}

export interface TransactionRow {
  [key: string]: unknown;
}

// Masterdata types
export interface DocumentType {
  id: number;
  name: string;
  code?: string;
  [key: string]: unknown;
}

export interface DocumentRepositoryType {
  id: number;
  name: string;
  code?: string;
  [key: string]: unknown;
}

// Person from /persons?email=
export interface Person {
  id: number;
  personId?: number;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

// Document upload payload
export interface DocumentPayload {
  portfolioId: number;
  documentTypeId: number;
  repositoryTypeId?: number;
  personId?: number;
  fileName: string;
  fileContent: string; // base64
  mimeType: string;
}

// Upload history entry (client-side only)
export interface UploadRecord {
  id: string;
  timestamp: string;
  portfolioNumber: string;
  portfolioId: number;
  fileName: string;
  documentTypeName: string;
  personName?: string;
  status: 'success' | 'error';
  errorMessage?: string;
}
