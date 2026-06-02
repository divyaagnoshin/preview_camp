import { Router, Request, Response, NextFunction } from 'express';
import { parse } from 'csv-parse';
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import SftpClient from 'ssh2-sftp-client';
import * as FtpClient from 'basic-ftp';
import { Readable, Writable } from 'stream';
import pool from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { importCsvRecords } from './contacts';

// Downloads every .csv (or one specific file) from the configured FTP/SFTP
// folder into memory. Returns a list of { name, text } entries.
//
// Path resolution: when opts.source_path is set it overrides folder +
// file_name. If it ends with .csv it's treated as a single file path,
// otherwise as a folder to scan.
async function downloadFromFtp(
  cred: any,
  opts: any,
): Promise<{ name: string; text: string }[]> {
  const protocol: 'ftp' | 'sftp' = cred.protocol === 'ftp' ? 'ftp' : 'sftp';
  let folder =
    (opts.reading_folder || opts.folder || '').replace(/\/+$/, '') || '.';
  let wantedFile: string | undefined = opts.file_name;
  if (opts.source_path) {
    const sp = String(opts.source_path).replace(/\/+$/, '');
    if (/\.csv$/i.test(sp)) {
      const idx = sp.lastIndexOf('/');
      folder = idx >= 0 ? sp.slice(0, idx) || '.' : '.';
      wantedFile = idx >= 0 ? sp.slice(idx + 1) : sp;
    } else {
      folder = sp || '.';
      wantedFile = undefined;
    }
  }
  const port = cred.port
    ? parseInt(cred.port, 10)
    : protocol === 'sftp'
      ? 22
      : 21;
  const out: { name: string; text: string }[] = [];
  const collect = (name: string, buf: Buffer) =>
    out.push({ name, text: buf.toString('utf-8') });

  if (protocol === 'sftp') {
    const sftp = new SftpClient();
    try {
      await sftp.connect({
        host: cred.host,
        port,
        username: cred.username,
        password: cred.password,
      });
      let listResult: any[] = [];
      if (!wantedFile) {
        listResult = (await sftp.list(folder)) as any[];
        console.log(
          '[SFTP DEBUG] Listed folder:',
          folder,
          'Result length:',
          listResult.length,
        );
        console.log('[SFTP DEBUG] First few items:', listResult.slice(0, 3));
      }
      const csvItems = listResult.filter((e) => /\.csv$/i.test(e.name));
      console.log('[SFTP DEBUG] All items ending in .csv:', csvItems);

      const targets: string[] = wantedFile
        ? [`${folder}/${wantedFile}`]
        : csvItems.map((e) => `${folder}/${e.name}`);
      console.log('[SFTP DEBUG] Targets array:', targets);
      for (const path of targets) {
        const buf = (await sftp.get(path)) as Buffer;
        collect(path.split('/').pop() || path, buf);
      }
    } finally {
      await sftp.end();
    }
  } else {
    const client = new FtpClient.Client();
    try {
      await client.access({
        host: cred.host,
        port,
        user: cred.username,
        password: cred.password,
        secure: false,
      });
      const targets: string[] = wantedFile
        ? [wantedFile]
        : (await client.list(folder))
            .filter((e: any) => e.isFile && /\.csv$/i.test(e.name))
            .map((e: any) => e.name);
      for (const name of targets) {
        const chunks: Buffer[] = [];
        const sink = new Writable({
          write(chunk, _enc, cb) {
            chunks.push(Buffer.from(chunk));
            cb();
          },
        });
        await client.downloadTo(sink, `${folder}/${name}`);
        collect(name, Buffer.concat(chunks));
      }
    } finally {
      client.close();
    }
  }
  return out;
}

async function archiveFtpFile(
  cred: any,
  opts: any,
  filename: string,
): Promise<void> {
  const protocol: 'ftp' | 'sftp' = cred.protocol === 'ftp' ? 'ftp' : 'sftp';
  const readingFolder =
    (opts.reading_folder || opts.folder || '').replace(/\/+$/, '') || '.';
  const archiveFolder = (opts.archive_folder || '').replace(/\/+$/, '');
  if (!archiveFolder) return;

  const oldPath = `${readingFolder}/${filename}`;
  const newPath = `${archiveFolder}/${filename}`;

  const port = cred.port
    ? parseInt(cred.port, 10)
    : protocol === 'sftp'
      ? 22
      : 21;

  if (protocol === 'sftp') {
    const sftp = new SftpClient();
    try {
      await sftp.connect({
        host: cred.host,
        port,
        username: cred.username,
        password: cred.password,
      });
      // 1. Ensure the target directory exists
      await sftp.mkdir(archiveFolder, true).catch(() => {});

      // 2. Delete the destination file if it already exists (SFTP rename won't overwrite on Windows)
      await sftp.delete(newPath).catch(() => {});

      // 3. Move the file
      await sftp.rename(oldPath, newPath);
      console.log(`[SFTP ARCHIVE] Moved ${oldPath} to ${newPath}`);
    } catch (e) {
      console.error(
        `[SFTP ARCHIVE] Failed to move ${oldPath} to ${newPath}:`,
        e,
      );
    } finally {
      await sftp.end();
    }
  } else {
    const client = new FtpClient.Client();
    try {
      await client.access({
        host: cred.host,
        port,
        user: cred.username,
        password: cred.password,
        secure: false,
      });
      await client.ensureDir(archiveFolder).catch(() => {});
      await client.remove(newPath).catch(() => {});
      await client.rename(oldPath, newPath);
      console.log(`[FTP ARCHIVE] Moved ${oldPath} to ${newPath}`);
    } catch (e) {
      console.error(
        `[FTP ARCHIVE] Failed to move ${oldPath} to ${newPath}:`,
        e,
      );
    } finally {
      client.close();
    }
  }
}

async function archiveS3File(
  client: S3Client,
  bucket: string,
  opts: any,
  key: string,
) {
  const archiveFolder = (opts.archive_folder || '').replace(/\/+$/, '');
  if (!archiveFolder) return;

  const filename = key.split('/').pop() || key;
  const newKey = `${archiveFolder}/${filename}`;

  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${key}`,
        Key: newKey,
      }),
    );
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    console.log(`[S3 ARCHIVE] Moved ${key} to ${newKey}`);
  } catch (e) {
    console.error(`[S3 ARCHIVE] Failed to move ${key} to ${newKey}:`, e);
  }
}

const router = Router();
router.use(authenticate);

// Drains a Node Readable into a string. Used for both S3 GetObject body
// streams and SFTP/FTP downloads buffered in memory.
async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// Translates AWS SDK errors (PermanentRedirect, NoSuchBucket, AccessDenied,
// InvalidAccessKeyId, etc.) into a single human-readable line for the UI.
function formatS3Error(e: any): string {
  const code = e?.Code || e?.name || 'S3Error';
  const msg = e?.message || 'unknown error';
  if (code === 'PermanentRedirect' && e?.Endpoint) {
    const m = String(e.Endpoint).match(/\.s3\.([a-z0-9-]+)\.amazonaws\.com/i);
    const region = m ? m[1] : "the bucket's region";
    return `Bucket is in a different region. Set Region to "${region}" and retry.`;
  }
  if (code === 'NoSuchBucket')
    return `Bucket not found: ${e.Bucket || ''}`.trim();
  if (code === 'NoSuchKey') return `File not found in bucket.`;
  if (code === 'AccessDenied')
    return `Access denied — check the access key has s3:ListBucket / s3:GetObject permission.`;
  if (code === 'InvalidAccessKeyId') return `Invalid Access Key ID.`;
  if (code === 'SignatureDoesNotMatch')
    return `Secret Access Key is incorrect.`;
  return `${code}: ${msg}`;
}

function formatFtpError(e: any): string {
  const code = e?.code || e?.name || 'FtpError';
  const msg = e?.message || 'unknown error';
  if (/ENOTFOUND|EAI_AGAIN/i.test(code)) return `Host not found.`;
  if (/ECONNREFUSED/i.test(code))
    return `Connection refused — check host and port.`;
  if (/ETIMEDOUT/i.test(code)) return `Connection timed out.`;
  if (/auth/i.test(msg))
    return `Authentication failed — check username and password.`;
  return `${code}: ${msg}`;
}

function parseCsv(text: string, delimiter = ','): Promise<any[]> {
  return new Promise((resolve, reject) => {
    parse(
      text,
      { columns: true, delimiter, skip_empty_lines: true, trim: true },
      (err, data) => (err ? reject(err) : resolve(data)),
    );
  });
}

// Resolves the list of remote keys/paths to download. sourcePath, when set,
// overrides folder + fileName: if it ends with .csv it's a single key,
// otherwise it's used as the prefix to list. Without it we fall back to
// folder + file_name (file_name picks one file; otherwise list every .csv).
async function listS3Keys(
  client: S3Client,
  bucket: string,
  folder: string,
  fileName?: string,
  sourcePath?: string,
): Promise<string[]> {
  if (sourcePath) {
    const sp = sourcePath.replace(/^\/+/, '');
    if (/\.csv$/i.test(sp)) return [sp];
    const prefix = sp.replace(/\/+$/, '') + '/';
    const out = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
    );
    return (out.Contents || [])
      .map((o) => o.Key!)
      .filter((k) => k.toLowerCase().endsWith('.csv'));
  }
  const prefix = folder ? folder.replace(/\/+$/, '') + '/' : '';
  if (fileName) return [prefix + fileName];
  const out = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
  );
  return (out.Contents || [])
    .map((o) => o.Key!)
    .filter((k) => k.toLowerCase().endsWith('.csv'));
}

export interface CloudImportResult {
  batch_id: string;
  provider: string;
  status: string;
  files: {
    file: string;
    imported: number;
    failed: number;
    skipped: number;
  }[];
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  skipped_rows: number;
  errors: { file: string; row: number; error: string }[];
}

// Performs a single cloud-import run. Used by both the user-triggered route
// below and the cron scheduler. Throws AppError on validation/IO failure;
// the batch row is left in 'failed' state for the caller to inspect.
export async function runCloudImport(args: {
  contactListIds: string[];
  orgId: string;
  userId: string;
  configId?: string;
  provider?: string;
  credentials?: any;
  options?: any;
}): Promise<CloudImportResult> {
  let batchId: string | null = null;
  try {
    let provider = args.provider;
    let credentials = args.credentials || {};
    let options = args.options || {};

    // Saved-config path: load credentials + options from cloud_import_configs
    // and stamp last_used_at so the table can show recency.
    if (args.configId) {
      const cfg = await pool.query(
        `SELECT provider, credentials, options
             FROM cloud_import_configs
            WHERE id = $1 AND org_id = $2`,
        [args.configId, args.orgId],
      );
      if (!cfg.rows.length) throw new AppError(404, 'Config not found');
      provider = cfg.rows[0].provider;
      credentials = { ...cfg.rows[0].credentials, ...credentials };
      options = { ...cfg.rows[0].options, ...options };
      await pool
        .query(
          `UPDATE cloud_import_configs SET last_used_at = NOW() WHERE id = $1`,
          [args.configId],
        )
        .catch(() => undefined);
    }

    if (provider !== 's3' && provider !== 'ftp' && provider !== 'gcs')
      throw new AppError(400, "provider must be 's3', 'ftp', or 'gcs'");
    if (provider === 'gcs')
      throw new AppError(
        501,
        'Google Cloud Storage import is not yet implemented on this server. Install @google-cloud/storage to enable it.',
      );

    const ingestionMethod = provider === 's3' ? 'S3_IMPORT' : 'FTP_IMPORT';
    // source_path overrides folder + file_name when set (see listS3Keys /
    // downloadFromFtp). Mirror that here so the audit trail matches.
    const pathPart =
      options.source_path ||
      `${options.folder || ''}${options.file_name ? (options.folder ? '/' : '') + options.file_name : ''}`;
    const sourceRef =
      provider === 's3'
        ? `s3://${options.bucket_name}/${pathPart}`
        : `${credentials.protocol || 'sftp'}://${credentials.host}/${pathPart}`;

    const currentBatchIds: string[] = [];
    for (const listId of args.contactListIds) {
      const batchRes = await pool.query(
        `INSERT INTO contact_upload_batches
             (contact_list_id, ingestion_method, source_ref, status, uploaded_by)
           VALUES ($1,$2,$3,'processing',$4) RETURNING id`,
        [listId, ingestionMethod, sourceRef, args.userId],
      );
      currentBatchIds.push(batchRes.rows[0].id);
    }
    batchId = currentBatchIds[0]; // just keep the first one for error reporting backwards compat

    const fileResults: {
      file: string;
      imported: number;
      failed: number;
      skipped: number;
    }[] = [];
    const allErrors: { file: string; row: number; error: string }[] = [];
    let totalRows = 0;
    let totalImported = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    const handleCsv = async (label: string, text: string) => {
      const records = await parseCsv(text);
      totalRows += records.length;
      for (let i = 0; i < args.contactListIds.length; i++) {
        const listId = args.contactListIds[i];
        const bId = currentBatchIds[i];
        const r = await importCsvRecords(
          records,
          listId,
          args.orgId,
          bId,
          ingestionMethod,
        );
        totalImported += r.imported;
        totalFailed += r.failed;
        fileResults.push({
          file:
            label + (args.contactListIds.length > 1 ? ` (List ${i + 1})` : ''),
          imported: r.imported,
          failed: r.failed,
          skipped: 0,
        });
        for (const e of r.errors)
          allErrors.push({ file: label, row: e.row, error: e.error });
      }
    };

    if (provider === 's3') {
      const { access_key_id, secret_access_key, region } = credentials;
      if (!access_key_id || !secret_access_key)
        throw new AppError(400, 'S3 credentials missing');
      if (!options.bucket_name) throw new AppError(400, 'bucket_name required');
      // followRegionRedirects transparently retries against the bucket's real
      // region when the configured one is wrong (PermanentRedirect / 301).
      const client = new S3Client({
        region: region || 'us-east-1',
        followRegionRedirects: true,
        credentials: {
          accessKeyId: access_key_id,
          secretAccessKey: secret_access_key,
        },
      });
      try {
        const keys = await listS3Keys(
          client,
          options.bucket_name,
          options.folder || '',
          options.file_name,
          options.source_path,
        );
        if (!keys.length)
          throw new AppError(404, 'No .csv files found at the given location');
        for (const k of keys) {
          const obj = await client.send(
            new GetObjectCommand({ Bucket: options.bucket_name, Key: k }),
          );
          const text = await streamToString(obj.Body as Readable);
          await handleCsv(k, text);
          if (options.archive_folder) {
            await archiveS3File(client, options.bucket_name, options, k);
          }
        }
      } catch (e: any) {
        if (e instanceof AppError) throw e;
        throw new AppError(400, formatS3Error(e));
      }
    } else {
      try {
        const files = await downloadFromFtp(credentials, options);
        if (!files.length)
          throw new AppError(404, 'No .csv files found on the server');
        for (const f of files) {
          await handleCsv(f.name, f.text);
          if (options.archive_folder) {
            await archiveFtpFile(credentials, options, f.name);
          }
        }
      } catch (e: any) {
        if (e instanceof AppError) throw e;
        throw new AppError(400, formatFtpError(e));
      }
    }

    const status =
      totalFailed > 0 && totalImported === 0
        ? 'failed'
        : totalFailed > 0
          ? 'partial_failure'
          : 'done';
    for (const bId of currentBatchIds) {
      await pool.query(
        `UPDATE contact_upload_batches
           SET total_rows=$1, imported_rows=$2, failed_rows=$3,
               status=$4, completed_at=NOW()
           WHERE id=$5`,
        [totalRows, totalImported, totalFailed, status, bId],
      );
    }

    return {
      batch_id: batchId,
      provider,
      status,
      files: fileResults,
      total_rows: totalRows,
      imported_rows: totalImported,
      failed_rows: totalFailed,
      skipped_rows: totalSkipped,
      errors: allErrors,
    };
  } catch (err: any) {
    if (batchId) {
      await pool
        .query(
          `UPDATE contact_upload_batches
             SET status='failed', completed_at=NOW(), error_log=$2
             WHERE id=$1`,
          [batchId, JSON.stringify({ error: err?.message || String(err) })],
        )
        .catch(() => undefined);
    }
    throw err;
  }
}
// POST /v1/cloud-imports/run — manual override triggered from the UI.
router.post('/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { config_id, provider, credentials, options } = req.body;
    let finalLists: string[] = req.body.contact_list_ids || [];

    // If a config_id is provided, grab its contact_list_ids.
    if (config_id && finalLists.length === 0) {
      const cfg = await pool.query(
        `SELECT contact_list_ids FROM cloud_import_configs WHERE id = $1 AND org_id = $2`,
        [config_id, req.user!.orgId],
      );
      if (cfg.rows.length) {
        finalLists = cfg.rows[0].contact_list_ids || [];
      }
    }

    if (!finalLists.length) {
      throw new AppError(400, 'contact_list_ids array required to run import');
    }

    const result = await runCloudImport({
      contactListIds: finalLists,
      orgId: req.user!.orgId,
      userId: req.user!.userId,
      configId: config_id,
      provider,
      credentials,
      options,
    });
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
