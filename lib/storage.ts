/**
 * Storage backend abstraction for attachments and CSV backups.
 *
 * Two drivers are available:
 *
 *   local (default) — writes/reads files under `process.env.UPLOAD_DIR`,
 *   matching SAM's historical behaviour.
 *
 *   s3 — writes/reads against an S3-compatible bucket. Selected when
 *   `STORAGE_DRIVER=s3` and `S3_BUCKET` is set. Custom endpoints are
 *   supported (MinIO, Cloudflare R2, Backblaze B2, Wasabi, OVH).
 *
 * The driver is a process-level singleton chosen on first call.
 */

import { mkdir, readFile, realpath, unlink, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  NoSuchKey,
  S3ServiceException,
} from "@aws-sdk/client-s3";

// ── Public API ───────────────────────────────────────────────────────────────

export class StorageNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}

export interface StorageDriver {
  readonly name: "local" | "s3";
  /** Upload a buffer at `key`. `contentType` is sent as Content-Type to S3 (ignored locally). */
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Read an object back. Throws StorageNotFoundError if missing. */
  getObject(key: string): Promise<Buffer>;
  /** Delete an object. Idempotent: missing keys are not an error. */
  deleteObject(key: string): Promise<void>;
}

let _driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (_driver) return _driver;

  if (process.env.STORAGE_DRIVER === "s3") {
    if (!process.env.S3_BUCKET) {
      throw new Error(
        "STORAGE_DRIVER=s3 but S3_BUCKET is not set. Configure S3_BUCKET (and S3_REGION, optionally S3_ENDPOINT) or unset STORAGE_DRIVER."
      );
    }
    _driver = new S3Driver();
  } else {
    _driver = new LocalDriver();
  }
  return _driver;
}

/** Test hook — never call from application code. */
export function _resetStorageDriverForTest(): void {
  _driver = null;
}

// ── Path safety (used by LocalDriver; exported so it can be unit-tested) ─────

/**
 * Prevent path traversal: ensure `resolvedPath` is within `uploadRoot`.
 * Uses `realpath()` to follow symlinks so that a symlink pointing outside the
 * upload root cannot be used to read or delete arbitrary files. Falls back to
 * a string-based check when the path doesn't exist yet (e.g. before write).
 */
export async function assertSafePath(
  uploadRoot: string,
  resolvedPath: string
): Promise<void> {
  let realRoot: string;
  let realPath: string;
  try {
    [realRoot, realPath] = await Promise.all([
      realpath(uploadRoot),
      realpath(resolvedPath),
    ]);
  } catch {
    if (
      !resolvedPath.startsWith(uploadRoot + "/") &&
      resolvedPath !== uploadRoot
    ) {
      throw new Error("Path traversal detected");
    }
    return;
  }
  if (!realPath.startsWith(realRoot + "/") && realPath !== realRoot) {
    throw new Error("Path traversal detected");
  }
}

// ── LocalDriver ──────────────────────────────────────────────────────────────

function getUploadRoot(): string {
  // UPLOAD_DIR is a runtime volume mount, not a project file — without this,
  // build-time file tracing can't prove the path is bounded and falls back to
  // tracing the whole project into the standalone output.
  return resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || "./uploads");
}

class LocalDriver implements StorageDriver {
  readonly name = "local" as const;

  async putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
    const uploadRoot = getUploadRoot();
    const fullPath = resolve(uploadRoot, key);
    await assertSafePath(uploadRoot, fullPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, body);
  }

  async getObject(key: string): Promise<Buffer> {
    const uploadRoot = getUploadRoot();
    const fullPath = resolve(uploadRoot, key);
    await assertSafePath(uploadRoot, fullPath);
    try {
      return await readFile(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new StorageNotFoundError(key);
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const uploadRoot = getUploadRoot();
    const fullPath = resolve(uploadRoot, key);
    try {
      await assertSafePath(uploadRoot, fullPath);
      await unlink(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      // Path-traversal or other error — propagate so callers see real failures.
      throw err;
    }
  }
}

// ── S3Driver ─────────────────────────────────────────────────────────────────

class S3Driver implements StorageDriver {
  readonly name = "s3" as const;
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET!;
    this.client = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      ...(process.env.S3_FORCE_PATH_STYLE === "true"
        ? { forcePathStyle: true }
        : {}),
    });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
        ServerSideEncryption: "AES256",
      })
    );
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      if (!res.Body) {
        throw new StorageNotFoundError(key);
      }
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof NoSuchKey) {
        throw new StorageNotFoundError(key);
      }
      // Some S3-compatible providers return 404 without the typed NoSuchKey
      if (err instanceof S3ServiceException && err.$metadata?.httpStatusCode === 404) {
        throw new StorageNotFoundError(key);
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
      );
    } catch (err) {
      // S3 DeleteObject is already idempotent server-side; only swallow the
      // explicit "not found" cases for parity with the local driver.
      if (err instanceof NoSuchKey) return;
      if (err instanceof S3ServiceException && err.$metadata?.httpStatusCode === 404) return;
      throw err;
    }
  }
}

/**
 * Runs a storage write/read for a route handler. A failure is logged and
 * becomes the 502 to send back (`{ error }`), so a storage
 * outage never surfaces as an unlogged 500.
 */
export async function attemptStorage<T>(
  label: string,
  userMessage: string,
  op: () => Promise<T>
): Promise<{ value: T } | { error: Response }> {
  try {
    return { value: await op() };
  } catch (err) {
    console.error(`[storage] ${label} failed`, err);
    return { error: Response.json({ error: userMessage, code: "storageUnavailable" }, { status: 502 }) };
  }
}
