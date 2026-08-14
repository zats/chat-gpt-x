export interface Env {
  DB: D1Database;
  AUTH_ENCRYPTION_KEY: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_ENVIRONMENT: string;
  GITHUB_SECRET_NAME: string;
}

export interface TokenFields extends Record<string, unknown> {
  access_token: string;
  refresh_token: string;
  id_token?: unknown;
  account_id?: unknown;
}

export interface AuthDocument extends Record<string, unknown> {
  tokens: TokenFields;
}

export interface HealthRecord {
  revision: number;
  refreshedAt: string | null;
  validUntil: string | null;
  validatedAt: string | null;
  githubPublishedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface JobStore {
  acquireLease(owner: string, now: Date, until: Date): Promise<boolean>;
  loadAuth(owner: string): Promise<AuthDocument>;
  saveRefreshedAuth(
    owner: string,
    auth: AuthDocument,
    refreshedAt: Date,
  ): Promise<void>;
  complete(
    owner: string,
    values: {
      validUntil: Date;
      validatedAt: Date;
      githubPublishedAt: Date;
      completedAt: Date;
      warning: SafeError | null;
    },
  ): Promise<void>;
  recordFailure(owner: string, at: Date, error: SafeError): Promise<void>;
  releaseLease(owner: string): Promise<void>;
  readHealth(): Promise<HealthRecord | null>;
}

export interface SafeError {
  code: string;
  message: string;
}
