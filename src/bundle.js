/**
 * A run, zipped for download: the exact IDF and EPW the engine was handed and
 * the tabular report it wrote back, with a manifest that says what each is.
 *
 * The point is trust. Everything the sheet reports is derived in the browser
 * from a run nobody else witnessed, and a number you cannot reproduce is a
 * number you have to take on faith. This hands the run over whole so it can be
 * re-run in any EnergyPlus and checked against the page. Which puts one
 * requirement above all others: the bytes have to be the genuine ones. The IDF
 * is the text passed to `ep.run`, not a fresh `writeIdf` that might have moved
 * since; the EPW is the file as fetched; `eplustbl.htm` is what EnergyPlus
 * wrote. Nothing is fabricated to fill a gap — a design-day run carries no
 * weather file, and the manifest says so rather than inventing one, the same
 * refusal the weather picker makes when a station's design conditions can't be
 * read.
 *
 * The ZIP is written by hand rather than pulling in a library, because the page
 * already inflates gzip with `DecompressionStream` and the mirror of that,
 * `CompressionStream('deflate-raw')`, is all a standard ZIP's DEFLATE member
 * needs. The whole format is one local header per file, a central directory
 * repeating them, and an end record — a few dozen bytes of little-endian
 * bookkeeping around bodies the browser compresses for us.
 */

const enc = new TextEncoder();

/**
 * CRC-32 (IEEE, the polynomial ZIP uses), computed straight rather than from a
 * precomputed table: these payloads run to a couple of megabytes at most and
 * are crc'd once on a click nobody is timing, so the table would be memory
 * spent to save nothing anyone would feel.
 */
function crc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

/** DEFLATE a buffer with the browser's own compressor. */
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A timestamp in the packed MS-DOS form the ZIP local header carries. The
 * format predates 1980 having a bit to spare, so it cannot express an earlier
 * year and the seconds field holds only every second value; both are clamped
 * rather than allowed to wrap into a nonsense date.
 */
function dosStamp(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Assemble `files` — `{ name, bytes }` records — into a ZIP Blob.
 *
 * Each member is stored compressed only when that actually saves space: a
 * short manifest or an already-dense payload can deflate larger than it began,
 * and shipping the raw bytes under method 0 is both smaller and honest about
 * it. The UTF-8 flag (bit 11) is set because filenames here are ASCII but the
 * flag costs nothing and spares a mojibake bug the day one is not.
 */
export async function zip(files, { date = new Date() } = {}) {
  const stamp = dosStamp(date);
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.name);
    const crc = crc32(file.bytes);
    const packed = await deflate(file.bytes);
    const deflated = packed.length < file.bytes.length;
    const body = deflated ? packed : file.bytes;
    const method = deflated ? 8 : 0;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed to extract: 2.0, for DEFLATE
    local.setUint16(6, 0x0800, true); // general-purpose flags: UTF-8 filename
    local.setUint16(8, method, true);
    local.setUint16(10, stamp.time, true);
    local.setUint16(12, stamp.day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, file.bytes.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true); // extra-field length
    parts.push(new Uint8Array(local.buffer), name, body);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true); // version made by
    dir.setUint16(6, 20, true); // version needed
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, method, true);
    dir.setUint16(12, stamp.time, true);
    dir.setUint16(14, stamp.day, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, body.length, true);
    dir.setUint32(24, file.bytes.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true); // offset of the matching local header
    central.push({ dir: new Uint8Array(dir.buffer), name });

    offset += 30 + name.length + body.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const entry of central) {
    parts.push(entry.dir, entry.name);
    centralSize += entry.dir.length + entry.name.length;
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length, true); // entries on this disk
  end.setUint16(10, central.length, true); // entries total
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);
  parts.push(new Uint8Array(end.buffer));

  return new Blob(parts, { type: 'application/zip' });
}

const group = (n) => n.toLocaleString('en-US');

/**
 * The plain-text README that makes the bundle self-describing.
 *
 * Written the way the meter heads on the bill are written: every figure stated
 * with what it is, so the reader can argue with it. The reproduction line is
 * the whole reason the download exists, so it is spelled out for both run kinds
 * rather than left as an exercise.
 */
function manifest(run) {
  const epwFile = run.epw ? `${run.weatherStem ?? 'weather'}.epw` : null;
  const rows = [
    ['EnergyPlus', run.version],
    ['Run', run.annual ? `Annual (${group(run.hours)} hours)` : `Design days (${group(run.hours)} hours)`],
    [
      'Weather',
      epwFile ??
        'none — a design-day run, driven by the SizingPeriod:DesignDay objects written into the IDF',
    ],
    ['Location', run.location || '—'],
    ['Exit code', String(run.exitCode)],
    ['Errors', `${run.severe} severe / ${run.warnings} warning${run.warnings === 1 ? '' : 's'}`],
    ['Solved in', `${run.seconds.toFixed(2)} s, in-browser WebAssembly`],
    ['Bundled', run.date.toLocaleString('en-CA')],
  ];
  const pad = Math.max(...rows.map(([k]) => k.length));

  const files = [
    ['model.idf', 'the model, with its sizing periods included'],
    epwFile && [epwFile, 'the weather file, exactly as downloaded'],
    run.html && ['results/eplustbl.htm', 'the AllSummary tabular report EnergyPlus wrote'],
    ['MANIFEST.txt', 'this file'],
  ].filter(Boolean);
  const filePad = Math.max(...files.map(([k]) => k.length));

  const reproduce = run.epw
    ? `  energyplus -w ${epwFile} model.idf`
    : '  energyplus model.idf';

  return (
    `idfkit shoebox — simulation bundle\n` +
    `\n` +
    `This is the exact input and output of a run performed in your browser at\n` +
    `shoebox.idfkit.com. Nothing here is re-derived: the IDF is the text handed\n` +
    `to the engine, the EPW is the weather file as downloaded, and the report is\n` +
    `what EnergyPlus wrote back. Re-run it to reproduce every number the page\n` +
    `showed.\n` +
    `\n` +
    rows.map(([k, v]) => `  ${k.padEnd(pad)}   ${v}`).join('\n') +
    `\n\n` +
    `Files\n` +
    files.map(([k, v]) => `  ${k.padEnd(filePad)}   ${v}`).join('\n') +
    `\n\n` +
    `To reproduce\n` +
    `  Install EnergyPlus ${run.version}, then from this folder run:\n` +
    reproduce +
    `\n`
  );
}

/** A filesystem-safe stem from the run's location, for the download's name. */
function slug(run) {
  const base = (run.location || 'run').replace(/,.*$/, '');
  const cleaned = base.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'run';
}

/**
 * Everything captured from one solved run, as a downloadable ZIP.
 *
 * Returns the Blob and the filename it should be offered under; the caller owns
 * the anchor-and-click, because that is a DOM concern and this module has no
 * business touching the page.
 */
export async function runBundle(run) {
  const date = run.date ?? new Date();
  const withDate = { ...run, date };

  const files = [{ name: 'model.idf', bytes: enc.encode(run.idf) }];
  if (run.epw) {
    files.push({ name: `${run.weatherStem ?? 'weather'}.epw`, bytes: enc.encode(run.epw) });
  }
  if (run.html) {
    files.push({ name: 'results/eplustbl.htm', bytes: enc.encode(run.html) });
  }
  files.push({ name: 'MANIFEST.txt', bytes: enc.encode(manifest(withDate)) });

  const blob = await zip(files, { date });
  return { blob, filename: `shoebox-${slug(run)}-${run.annual ? 'annual' : 'designday'}.zip` };
}
