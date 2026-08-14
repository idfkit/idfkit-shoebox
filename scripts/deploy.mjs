/**
 * Publish `dist/` to the bucket behind shoebox.idfkit.com.
 *
 * The interesting part of this script is not the upload, it is the compression.
 * CloudFront will compress on the fly, but only objects between 1 KB and 10 MB,
 * and only when the response `Content-Type` is on its own fixed list. This site
 * fails both conditions where it matters most:
 *
 *   - `energyplus.js-26.1.wasm` is 28.40 MiB and `Energy+.schema.epJSON` is
 *     9.88 MiB, so the two largest downloads on the page sit above the ceiling
 *     and would ship uncompressed;
 *   - `Energy+.idd` (4.29 MiB) and the `.idf` datasets have extensions S3 maps
 *     to `application/octet-stream`, which is not on the list either.
 *
 * Left to CloudFront, a cold visit transfers about 45 MB. Compressed here, it
 * transfers about 10 MB. So this script compresses every compressible file
 * itself and uploads it with `Content-Encoding`, and the result no longer
 * depends on a heuristic at the edge.
 *
 * Brotli rather than gzip, and brotli only, with no gzip fallback stored: every
 * browser that can run WebAssembly at all also accepts brotli over HTTPS
 * (brotli landed in Chrome 50, Firefox 44 and Safari 11; WebAssembly in Chrome
 * 57, Firefox 52 and Safari 11). A client that cannot read the response cannot
 * have run the engine either.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const brotli = promisify(zlib.brotliCompress);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
// Must match the region the stack was deployed into; see infra/bin/shoebox.ts
// for why that is us-east-1 and effectively fixed.
const REGION = process.env.SHOEBOX_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
const STACK = process.env.SHOEBOX_STACK ?? 'ShoeboxStack';

/**
 * What each extension is, and whether it is worth compressing.
 *
 * The `.gz` entry is the one that would bite. `stations.json.gz` and the schema
 * bundle are fetched as bytes and inflated by the page itself with
 * `DecompressionStream`. Both loaders sniff the gzip magic first, so they
 * survive a host that declares `Content-Encoding: gzip` — but declaring it
 * would still be wrong, because the browser would then hand the loader JSON
 * where it expects a gzip member. They ship exactly as stored.
 */
const TYPES = {
  '.html': ['text/html; charset=utf-8', true],
  '.js': ['text/javascript; charset=utf-8', true],
  '.mjs': ['text/javascript; charset=utf-8', true],
  '.css': ['text/css; charset=utf-8', true],
  '.json': ['application/json; charset=utf-8', true],
  '.epjson': ['application/json; charset=utf-8', true],
  '.wasm': ['application/wasm', true],
  '.idd': ['text/plain; charset=utf-8', true],
  '.idf': ['text/plain; charset=utf-8', true],
  '.csv': ['text/csv; charset=utf-8', true],
  '.txt': ['text/plain; charset=utf-8', true],
  '.xml': ['application/xml; charset=utf-8', true],
  '.svg': ['image/svg+xml', true],
  '.gz': ['application/gzip', false],
  '.zip': ['application/zip', false],
  '.png': ['image/png', false],
  '.ico': ['image/x-icon', false],
  '.woff2': ['font/woff2', false],
};

const describe = (key) => {
  const dot = key.lastIndexOf('.');
  const ext = dot === -1 ? '' : key.slice(dot).toLowerCase();
  return TYPES[ext] ?? ['application/octet-stream', false];
};

/**
 * Vite fingerprints what it builds into `assets/`, so those may be cached
 * forever. Nothing else here is fingerprinted — `Energy+.idd` keeps its name
 * across engine versions — so the rest gets a day and a deploy-time
 * invalidation. `index.html` is never cached: it is the one file whose staleness
 * would pin a visitor to the previous build entirely.
 */
const cacheControl = (key) => {
  if (key === 'index.html') return 'no-cache';
  if (key.startsWith('assets/')) return 'public, max-age=31536000, immutable';
  return 'public, max-age=86400';
};

/**
 * Quality 11 is worth its cost on small files and not on large ones. Measured
 * on the engine binary: q9 took 3.0 s for 6.23 MiB, q11 took 62.0 s for
 * 5.30 MiB. Paying a minute of every deploy for 0.93 MiB on a file the browser
 * caches after first visit is a bad trade; paying milliseconds for the best
 * ratio on everything else is a good one.
 */
const quality = (size) => (size > 4 * 1024 * 1024 ? 9 : 11);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** Run `jobs` with a bounded pool, so a 58-file engine tree does not open 58 sockets. */
async function pool(jobs, width) {
  const queue = [...jobs];
  const workers = Array.from({ length: Math.min(width, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await job();
  });
  await Promise.all(workers);
}

async function outputs() {
  const cfn = new CloudFormationClient({ region: REGION });
  const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: STACK }));
  const found = Object.fromEntries(
    (Stacks?.[0]?.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]),
  );
  for (const key of ['BucketName', 'DistributionId']) {
    // No fallback to an environment variable or a remembered value: publishing
    // into the wrong bucket is silent and the page keeps serving the old build,
    // which is exactly the class of failure that is hardest to notice.
    if (!found[key]) throw new Error(`Stack ${STACK} has no output ${key}. Deploy infra/ first.`);
  }
  return found;
}

async function main() {
  if (!(await stat(dist).catch(() => null))) {
    throw new Error(`No build at ${dist}. Run \`npm run build\` first.`);
  }

  const { BucketName, DistributionId } = await outputs();
  const s3 = new S3Client({ region: REGION });

  const files = [];
  for await (const file of walk(dist)) files.push(file);
  if (files.length === 0) throw new Error(`${dist} is empty.`);

  let raw = 0;
  let sent = 0;
  const keys = new Set();

  await pool(
    files.map((file) => async () => {
      const key = relative(dist, file).split(sep).join('/');
      const body = await readFile(file);
      const [ContentType, compressible] = describe(key);

      let payload = body;
      let ContentEncoding;
      // Compressing a file into something larger is possible on tiny inputs;
      // when it happens the original is what gets stored.
      if (compressible && body.length > 1024) {
        const packed = await brotli(body, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: quality(body.length),
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
          },
        });
        if (packed.length < body.length) {
          payload = packed;
          ContentEncoding = 'br';
        }
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: BucketName,
          Key: key,
          Body: payload,
          ContentType,
          ContentEncoding,
          CacheControl: cacheControl(key),
        }),
      );

      raw += body.length;
      sent += payload.length;
      keys.add(key);
    }),
    8,
  );

  // Anything in the bucket that this build did not produce is from an older
  // one. Leaving it would keep a deleted page reachable at its old URL.
  const stale = [];
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: BucketName, ContinuationToken: token }),
    );
    for (const object of page.Contents ?? []) {
      if (!keys.has(object.Key)) stale.push({ Key: object.Key });
    }
    token = page.NextContinuationToken;
  } while (token);

  for (let i = 0; i < stale.length; i += 1000) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BucketName,
        Delete: { Objects: stale.slice(i, i + 1000) },
      }),
    );
  }

  const cloudfront = new CloudFrontClient({ region: REGION });
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId,
      InvalidationBatch: {
        // One wildcard counts as a single path against the 1,000 free
        // invalidation paths a month, where listing each file would not.
        Paths: { Quantity: 1, Items: ['/*'] },
        CallerReference: `deploy-${Date.now()}`,
      },
    }),
  );

  // GitHub Actions logs for a public repository are world-readable, and the
  // bucket and distribution ids are needless disclosure there. Neither is a
  // credential and the bucket blocks public access, but nothing outside the
  // account has any use for them. Run by hand they are worth printing, because
  // knowing which bucket you just published to is rather the point.
  const mib = (n) => (n / 1048576).toFixed(1);
  const target = process.env.CI ? '' : ` to ${BucketName}`;
  console.log(
    `Published ${files.length} files${target}: ` +
      `${mib(raw)} MiB on disk, ${mib(sent)} MiB stored and served.`,
  );
  if (stale.length) console.log(`Removed ${stale.length} files left by an earlier build.`);
  console.log(process.env.CI ? 'Invalidated the distribution.' : `Invalidated ${DistributionId}.`);
}

await main();
