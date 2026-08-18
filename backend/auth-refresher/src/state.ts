import { decryptJson, encryptJson } from "./crypto";
import { parseAuthDocument } from "./auth";
import type {
  AuthDocument,
  Env,
  HealthRecord,
  JobStore,
  SafeError,
} from "./types";

const stateId = "codex-agent";

interface StateRow {
  auth_ciphertext: string;
  auth_iv: string;
  revision: number;
  refreshed_at: string | null;
  valid_until: string | null;
  validated_at: string | null;
  github_published_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
}

export class D1JobStore implements JobStore {
  constructor(private readonly env: Env) {}

  async acquireLease(owner: string, now: Date, until: Date): Promise<boolean> {
    const result = await this.env.DB.prepare(
      `UPDATE auth_state
       SET lease_owner = ?, lease_until = ?
       WHERE id = ?
         AND (lease_until IS NULL OR lease_until <= ?)`,
    )
      .bind(owner, until.toISOString(), stateId, now.toISOString())
      .run();
    if (result.meta.changes === 1) return true;

    const row = await this.env.DB.prepare(
      "SELECT lease_owner FROM auth_state WHERE id = ?",
    )
      .bind(stateId)
      .first<{ lease_owner: string | null }>();
    if (!row) throw new Error("The auth state is not provisioned");
    return false;
  }

  async loadAuth(owner: string): Promise<AuthDocument> {
    const row = await this.env.DB.prepare(
      `SELECT auth_ciphertext, auth_iv
       FROM auth_state WHERE id = ? AND lease_owner = ?`,
    )
      .bind(stateId, owner)
      .first<Pick<StateRow, "auth_ciphertext" | "auth_iv">>();
    if (!row) throw new Error("The auth state is missing or the lease was lost");
    const value = await decryptJson<unknown>(
      { ciphertext: row.auth_ciphertext, iv: row.auth_iv },
      this.env.AUTH_ENCRYPTION_KEY,
    );
    return parseAuthDocument(value);
  }

  async saveRefreshedAuth(
    owner: string,
    auth: AuthDocument,
    refreshedAt: Date,
  ): Promise<void> {
    const encrypted = await encryptJson(auth, this.env.AUTH_ENCRYPTION_KEY);
    await this.updateOwned(
      `UPDATE auth_state
       SET auth_ciphertext = ?, auth_iv = ?, revision = revision + 1,
           refreshed_at = ?, valid_until = NULL, validated_at = NULL,
           github_published_at = NULL
       WHERE id = ? AND lease_owner = ?`,
      [
        encrypted.ciphertext,
        encrypted.iv,
        refreshedAt.toISOString(),
        stateId,
        owner,
      ],
    );
  }

  async complete(
    owner: string,
    values: {
      validUntil: Date;
      validatedAt: Date;
      githubPublishedAt: Date;
      completedAt: Date;
      warning: SafeError | null;
    },
  ): Promise<void> {
    await this.updateOwned(
      `UPDATE auth_state
       SET valid_until = ?, validated_at = ?, github_published_at = ?,
           last_success_at = ?, last_error_at = ?, last_error_code = ?,
           last_error_message = ?
       WHERE id = ? AND lease_owner = ?`,
      [
        values.validUntil.toISOString(),
        values.validatedAt.toISOString(),
        values.githubPublishedAt.toISOString(),
        values.completedAt.toISOString(),
        values.warning ? values.completedAt.toISOString() : null,
        values.warning?.code ?? null,
        values.warning?.message ?? null,
        stateId,
        owner,
      ],
    );
  }

  async recordFailure(owner: string, at: Date, error: SafeError): Promise<void> {
    await this.updateOwned(
      `UPDATE auth_state
       SET last_error_at = ?, last_error_code = ?, last_error_message = ?
       WHERE id = ? AND lease_owner = ?`,
      [at.toISOString(), error.code, error.message, stateId, owner],
    );
  }

  async releaseLease(owner: string): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE auth_state SET lease_owner = NULL, lease_until = NULL
       WHERE id = ? AND lease_owner = ?`,
    )
      .bind(stateId, owner)
      .run();
  }

  async readHealth(): Promise<HealthRecord | null> {
    const row = await this.env.DB.prepare(
      `SELECT revision, refreshed_at, valid_until, validated_at,
              github_published_at, last_success_at, last_error_at,
              last_error_code, last_error_message
       FROM auth_state WHERE id = ?`,
    )
      .bind(stateId)
      .first<StateRow>();
    if (!row) return null;
    return {
      revision: row.revision,
      refreshedAt: row.refreshed_at,
      validUntil: row.valid_until,
      validatedAt: row.validated_at,
      githubPublishedAt: row.github_published_at,
      lastSuccessAt: row.last_success_at,
      lastErrorAt: row.last_error_at,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
    };
  }

  private async updateOwned(sql: string, values: unknown[]): Promise<void> {
    const result = await this.env.DB.prepare(sql).bind(...values).run();
    if (result.meta.changes !== 1) {
      throw new Error("The auth state lease was lost");
    }
  }
}
