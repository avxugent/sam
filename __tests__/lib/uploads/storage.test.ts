import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ── Mock @aws-sdk/client-s3 BEFORE importing storage ─────────────────────────
// vi.mock() is hoisted; the factory cannot reference module-level variables.
// All mock state lives inside the factory and is exposed via the mocked module.

vi.mock("@aws-sdk/client-s3", () => {
  class FakeS3ServiceException extends Error {
    $metadata: { httpStatusCode?: number };
    constructor(name: string, status?: number) {
      super(name);
      this.name = name;
      this.$metadata = { httpStatusCode: status };
    }
  }
  class FakeNoSuchKey extends FakeS3ServiceException {
    constructor() { super("NoSuchKey", 404); }
  }
  const sendMock = vi.fn();
  class FakeS3Client {
    send = sendMock;
    constructor(_config?: unknown) { /* no-op */ }
  }
  class FakePutObjectCommand { constructor(public input: unknown) {} __cmd = "Put"; }
  class FakeGetObjectCommand { constructor(public input: unknown) {} __cmd = "Get"; }
  class FakeDeleteObjectCommand { constructor(public input: unknown) {} __cmd = "Delete"; }
  return {
    __sendMock: sendMock,
    __FakeNoSuchKey: FakeNoSuchKey,
    __FakeS3ServiceException: FakeS3ServiceException,
    S3Client: FakeS3Client,
    PutObjectCommand: FakePutObjectCommand,
    GetObjectCommand: FakeGetObjectCommand,
    DeleteObjectCommand: FakeDeleteObjectCommand,
    NoSuchKey: FakeNoSuchKey,
    S3ServiceException: FakeS3ServiceException,
  };
});

import * as awsS3 from "@aws-sdk/client-s3";
import {
  assertSafePath,
  attemptStorageRead,
  getStorageDriver,
  StorageNotFoundError,
  _resetStorageDriverForTest,
} from "@/lib/uploads/storage";

// Pull mock state out of the mocked module
const sendMock = (awsS3 as unknown as { __sendMock: ReturnType<typeof vi.fn> }).__sendMock;
const FakeNoSuchKey = (awsS3 as unknown as { __FakeNoSuchKey: new () => Error }).__FakeNoSuchKey;
const FakeS3ServiceException = (awsS3 as unknown as {
  __FakeS3ServiceException: new (name: string, status?: number) => Error;
}).__FakeS3ServiceException;

// ── Local driver tests use a real tmp dir ───────────────────────────────────

let tmpRoot = "";
const origCwd = process.cwd();

function setupLocalDriver() {
  tmpRoot = mkdtempSync(join(tmpdir(), "sam-storage-"));
  process.chdir(tmpRoot);
  vi.stubEnv("UPLOAD_DIR", "uploads");
  vi.stubEnv("STORAGE_DRIVER", "");
  _resetStorageDriverForTest();
  // Pre-create the upload root so realpath() succeeds even without prior writes
  mkdirSync(join(tmpRoot, "uploads"), { recursive: true });
}

function teardownLocalDriver() {
  process.chdir(origCwd);
  if (tmpRoot && existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
  _resetStorageDriverForTest();
}

// ── getStorageDriver factory ─────────────────────────────────────────────────

describe("getStorageDriver()", () => {
  beforeEach(() => { _resetStorageDriverForTest(); vi.unstubAllEnvs(); });
  afterEach(() => { _resetStorageDriverForTest(); vi.unstubAllEnvs(); });

  it("returns LocalDriver by default", () => {
    expect(getStorageDriver().name).toBe("local");
  });

  it("returns S3Driver when STORAGE_DRIVER=s3 + bucket", () => {
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET", "test-bucket");
    expect(getStorageDriver().name).toBe("s3");
  });

  it("throws when STORAGE_DRIVER=s3 but bucket is missing", () => {
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET", "");
    expect(() => getStorageDriver()).toThrow(/S3_BUCKET/);
  });

  it("returns the same instance on repeat calls (singleton)", () => {
    const a = getStorageDriver();
    const b = getStorageDriver();
    expect(a).toBe(b);
  });
});

// ── assertSafePath ───────────────────────────────────────────────────────────

describe("assertSafePath()", () => {
  beforeEach(setupLocalDriver);
  afterEach(teardownLocalDriver);

  it("allows paths inside the root", async () => {
    const root = join(tmpRoot, "uploads");
    const safe = join(root, "a.txt");
    await expect(assertSafePath(root, safe)).resolves.toBeUndefined();
  });

  it("rejects paths that escape the root", async () => {
    const root = join(tmpRoot, "uploads");
    const escape = join(tmpRoot, "etc", "passwd");
    await expect(assertSafePath(root, escape)).rejects.toThrow(/traversal/);
  });
});

// ── LocalDriver round-trip ───────────────────────────────────────────────────

describe("LocalDriver", () => {
  beforeEach(setupLocalDriver);
  afterEach(teardownLocalDriver);

  it("put → get round-trip", async () => {
    const driver = getStorageDriver();
    expect(driver.name).toBe("local");

    const data = Buffer.from("hello world");
    await driver.putObject("locations/abc/file.txt", data, "text/plain");
    const back = await driver.getObject("locations/abc/file.txt");
    expect(back.toString()).toBe("hello world");
  });

  it("getObject throws StorageNotFoundError for missing files", async () => {
    const driver = getStorageDriver();
    await expect(driver.getObject("missing.txt")).rejects.toBeInstanceOf(
      StorageNotFoundError
    );
  });

  it("deleteObject is idempotent", async () => {
    const driver = getStorageDriver();
    await driver.putObject("a.txt", Buffer.from("x"), "text/plain");
    await driver.deleteObject("a.txt");
    await expect(driver.deleteObject("a.txt")).resolves.toBeUndefined();
  });

  it("deleteObject removes the file", async () => {
    const driver = getStorageDriver();
    await driver.putObject("b.txt", Buffer.from("y"), "text/plain");
    await driver.deleteObject("b.txt");
    await expect(driver.getObject("b.txt")).rejects.toBeInstanceOf(
      StorageNotFoundError
    );
  });

  it("creates intermediate directories", async () => {
    const driver = getStorageDriver();
    await driver.putObject("deep/nested/path/x.txt", Buffer.from("z"), "text/plain");
    const back = await driver.getObject("deep/nested/path/x.txt");
    expect(back.toString()).toBe("z");
  });

  it("rejects path traversal on put", async () => {
    const driver = getStorageDriver();
    // Pre-create a sibling target to make realpath() succeed and engage
    // the symlink-aware check rather than the cheaper string fallback.
    writeFileSync(join(tmpRoot, "outside.txt"), "");
    await expect(
      driver.putObject("../outside.txt", Buffer.from("hack"), "text/plain")
    ).rejects.toThrow();
  });
});

// ── S3Driver behaviour (mocked SDK) ──────────────────────────────────────────

describe("S3Driver", () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET", "test-bucket");
    vi.stubEnv("S3_REGION", "us-east-1");
    _resetStorageDriverForTest();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    _resetStorageDriverForTest();
  });

  it("putObject sends PutObjectCommand with body, content type, AES256", async () => {
    sendMock.mockResolvedValue({});
    const driver = getStorageDriver();
    await driver.putObject("a/b.png", Buffer.from("img"), "image/png");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0][0] as { __cmd: string; input: Record<string, unknown> };
    expect(cmd.__cmd).toBe("Put");
    expect(cmd.input.Bucket).toBe("test-bucket");
    expect(cmd.input.Key).toBe("a/b.png");
    expect(cmd.input.ContentType).toBe("image/png");
    expect(cmd.input.ServerSideEncryption).toBe("AES256");
  });

  it("getObject reads body via transformToByteArray()", async () => {
    sendMock.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
    const driver = getStorageDriver();
    const buf = await driver.getObject("k");
    expect([...buf]).toEqual([1, 2, 3]);
  });

  it("getObject maps NoSuchKey to StorageNotFoundError", async () => {
    sendMock.mockRejectedValue(new FakeNoSuchKey());
    const driver = getStorageDriver();
    await expect(driver.getObject("missing")).rejects.toBeInstanceOf(
      StorageNotFoundError
    );
  });

  it("getObject maps generic 404 (non-typed) to StorageNotFoundError", async () => {
    sendMock.mockRejectedValue(new FakeS3ServiceException("NotFound", 404));
    const driver = getStorageDriver();
    await expect(driver.getObject("missing")).rejects.toBeInstanceOf(
      StorageNotFoundError
    );
  });

  it("getObject rethrows other errors", async () => {
    sendMock.mockRejectedValue(new Error("network"));
    const driver = getStorageDriver();
    await expect(driver.getObject("k")).rejects.toThrow("network");
  });

  it("deleteObject swallows NoSuchKey", async () => {
    sendMock.mockRejectedValue(new FakeNoSuchKey());
    const driver = getStorageDriver();
    await expect(driver.deleteObject("missing")).resolves.toBeUndefined();
  });

  it("deleteObject rethrows non-404 errors", async () => {
    sendMock.mockRejectedValue(new FakeS3ServiceException("Forbidden", 403));
    const driver = getStorageDriver();
    await expect(driver.deleteObject("k")).rejects.toThrow();
  });
});

describe("attemptStorageRead()", () => {
  it("returns the bytes that were read", async () => {
    expect(await attemptStorageRead("x read", "msg", async () => Buffer.from("ok"))).toEqual({ value: Buffer.from("ok") });
  });

  it("maps a missing object to null", async () => {
    expect(await attemptStorageRead("x read", "msg", async () => { throw new StorageNotFoundError("k"); })).toEqual({ value: null });
  });

  it("logs any other failure and answers the coded 502", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await attemptStorageRead("x read", "Could not read.", async () => { throw new Error("down"); });
    if (!("error" in result)) throw new Error("expected an error response");
    expect(result.error.status).toBe(502);
    expect(await result.error.json()).toEqual({ error: "Could not read.", code: "storageUnavailable" });
    expect(errSpy).toHaveBeenCalledWith("[storage] x read failed", expect.any(Error));
    errSpy.mockRestore();
  });
});
