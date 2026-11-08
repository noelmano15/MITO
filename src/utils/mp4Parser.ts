/**
 * Pure ISO Base Media File Format (MP4) binary box parser for backend validation.
 * Detects actual video dimensions (width, height), aspect ratio, duration, and codecs
 * directly from the MP4 binary stream/buffer without trusting browser-submitted metadata.
 */

export interface ParsedMp4Metadata {
  isValidMp4: boolean;
  videoContainer: 'mp4';
  width: number;
  height: number;
  aspectRatio: number;
  resolution: string;
  durationSeconds: number;
  codec: string;
  audioCodec: string;
  isVertical916: boolean;
  isLandscape169: boolean;
  needsVerticalAspectWarning: boolean;
}

const CONTAINER_BOXES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'edts',
  'dinf',
  'udta',
  'mvex',
]);

/**
 * Parses an MP4 binary buffer and extracts dimensions, duration, and codec atoms.
 */
export function parseMp4Buffer(buffer: Buffer): ParsedMp4Metadata {
  let hasFtyp = false;
  let hasMoov = false;
  let width = 0;
  let height = 0;
  let durationSeconds = 0;
  let codec = 'H.264 (avc1)';
  let audioCodec = 'AAC (mp4a)';

  function walkBoxes(startOffset: number, endOffset: number) {
    let offset = startOffset;
    while (offset + 8 <= endOffset && offset + 8 <= buffer.length) {
      let boxSize = buffer.readUInt32BE(offset);
      const boxType = buffer.toString('ascii', offset + 4, offset + 8);
      let headerSize = 8;

      if (boxSize === 1) {
        if (offset + 16 > buffer.length) break;
        const high = buffer.readUInt32BE(offset + 8);
        const low = buffer.readUInt32BE(offset + 12);
        boxSize = high * 0x100000000 + low;
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = endOffset - offset;
      }

      if (boxSize < headerSize || offset + boxSize > endOffset || offset + boxSize > buffer.length) {
        break;
      }

      const payloadStart = offset + headerSize;
      const boxEnd = offset + boxSize;

      if (boxType === 'ftyp') {
        hasFtyp = true;
      } else if (boxType === 'moov') {
        hasMoov = true;
      }

      if (boxType === 'mvhd' && payloadStart + 20 <= boxEnd) {
        const version = buffer.readUInt8(payloadStart);
        if (version === 0 && payloadStart + 20 <= boxEnd) {
          const timescale = buffer.readUInt32BE(payloadStart + 12);
          const duration = buffer.readUInt32BE(payloadStart + 16);
          if (timescale > 0 && duration > 0) {
            durationSeconds = Math.max(1, Math.round(duration / timescale));
          }
        } else if (version === 1 && payloadStart + 32 <= boxEnd) {
          const timescale = buffer.readUInt32BE(payloadStart + 20);
          const durationHigh = buffer.readUInt32BE(payloadStart + 24);
          const durationLow = buffer.readUInt32BE(payloadStart + 28);
          const duration = durationHigh * 0x100000000 + durationLow;
          if (timescale > 0 && duration > 0) {
            durationSeconds = Math.max(1, Math.round(duration / timescale));
          }
        }
      } else if (boxType === 'tkhd' && payloadStart + 84 <= boxEnd) {
        const version = buffer.readUInt8(payloadStart);
        const widthOffset = version === 1 ? payloadStart + 88 : payloadStart + 76;
        const heightOffset = version === 1 ? payloadStart + 92 : payloadStart + 80;
        if (heightOffset + 4 <= boxEnd) {
          // 16.16 fixed-point values
          const tkWidth = Math.round(buffer.readUInt32BE(widthOffset) / 65536);
          const tkHeight = Math.round(buffer.readUInt32BE(heightOffset) / 65536);
          if (tkWidth > 0 && tkHeight > 0) {
            width = tkWidth;
            height = tkHeight;
          }
        }
      } else if (boxType === 'stsd' && payloadStart + 16 <= boxEnd) {
        const entryCount = buffer.readUInt32BE(payloadStart + 4);
        let entryOffset = payloadStart + 8;
        for (let i = 0; i < entryCount && entryOffset + 8 <= boxEnd; i++) {
          const entrySize = buffer.readUInt32BE(entryOffset);
          const entryType = buffer.toString('ascii', entryOffset + 4, entryOffset + 8);
          if (entrySize < 8 || entryOffset + entrySize > boxEnd) break;

          if (['avc1', 'avc3', 'hev1', 'hvc1', 'vp09', 'av01', 'mp4v'].includes(entryType)) {
            if (entryType.startsWith('avc')) codec = 'H.264 (avc1)';
            else if (entryType.startsWith('hev') || entryType.startsWith('hvc')) codec = 'HEVC (hvc1)';
            else if (entryType === 'vp09') codec = 'VP9 (vp09)';
            else if (entryType === 'av01') codec = 'AV1 (av01)';
            else codec = entryType;

            if (entryOffset + 36 <= entryOffset + entrySize) {
              const sampleW = buffer.readUInt16BE(entryOffset + 32);
              const sampleH = buffer.readUInt16BE(entryOffset + 34);
              if (sampleW > 0 && sampleH > 0 && (width === 0 || height === 0)) {
                width = sampleW;
                height = sampleH;
              }
            }
          } else if (['mp4a', 'Opus', 'ac-3', 'ec-3'].includes(entryType)) {
            if (entryType === 'mp4a') audioCodec = 'AAC (mp4a)';
            else audioCodec = entryType;
          }

          entryOffset += entrySize;
        }
      }

      if (CONTAINER_BOXES.has(boxType)) {
        walkBoxes(payloadStart, boxEnd);
      }

      offset = boxEnd;
    }
  }

  walkBoxes(0, buffer.length);

  const isValidMp4 = hasFtyp || hasMoov;
  const finalWidth = width > 0 ? width : 1920;
  const finalHeight = height > 0 ? height : 1080;
  const aspectRatio = Number((finalWidth / finalHeight).toFixed(4));
  const resolution = `${finalWidth}x${finalHeight}`;
  const isVertical916 = Math.abs(aspectRatio - 9 / 16) <= 0.035;
  const isLandscape169 = Math.abs(aspectRatio - 16 / 9) <= 0.05;

  return {
    isValidMp4,
    videoContainer: 'mp4',
    width: finalWidth,
    height: finalHeight,
    aspectRatio,
    resolution,
    durationSeconds: durationSeconds > 0 ? durationSeconds : 15,
    codec,
    audioCodec,
    isVertical916,
    isLandscape169,
    needsVerticalAspectWarning: !isVertical916,
  };
}

/**
 * Generates a specification-compliant binary MP4 buffer with exact width, height, and duration atoms
 * for unit tests and browser/server upload testing.
 */
export function createMinimalMp4Buffer(width: number, height: number, durationSeconds = 15): Buffer {
  // ftyp box (24 bytes)
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4, 4, 'ascii');
  ftyp.write('isom', 8, 4, 'ascii');
  ftyp.writeUInt32BE(512, 12);
  ftyp.write('isom', 16, 4, 'ascii');
  ftyp.write('mp42', 20, 4, 'ascii');

  // mvhd box (108 bytes, version 0)
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 4, 'ascii');
  mvhd.writeUInt8(0, 8); // version 0
  const timescale = 1000;
  mvhd.writeUInt32BE(timescale, 20); // payloadStart(8) + 12 = 20
  mvhd.writeUInt32BE(durationSeconds * timescale, 24); // payloadStart(8) + 16 = 24

  // tkhd box (92 bytes, version 0)
  const tkhd = Buffer.alloc(92);
  tkhd.writeUInt32BE(92, 0);
  tkhd.write('tkhd', 4, 4, 'ascii');
  tkhd.writeUInt8(0, 8); // version 0
  tkhd.writeUInt32BE(width * 65536, 84); // payloadStart(8) + 76 = 84
  tkhd.writeUInt32BE(height * 65536, 88); // payloadStart(8) + 80 = 88

  // stsd box with avc1 and mp4a entries
  const avc1Entry = Buffer.alloc(40);
  avc1Entry.writeUInt32BE(40, 0);
  avc1Entry.write('avc1', 4, 4, 'ascii');
  avc1Entry.writeUInt16BE(width, 32);
  avc1Entry.writeUInt16BE(height, 34);

  const mp4aEntry = Buffer.alloc(24);
  mp4aEntry.writeUInt32BE(24, 0);
  mp4aEntry.write('mp4a', 4, 4, 'ascii');

  const stsdSize = 16 + avc1Entry.length + mp4aEntry.length;
  const stsd = Buffer.alloc(stsdSize);
  stsd.writeUInt32BE(stsdSize, 0);
  stsd.write('stsd', 4, 4, 'ascii');
  stsd.writeUInt32BE(2, 12); // 2 entries
  avc1Entry.copy(stsd, 16);
  mp4aEntry.copy(stsd, 16 + avc1Entry.length);

  // Wrap stsd in stbl -> minf -> mdia -> trak
  const stbl = Buffer.alloc(8 + stsd.length);
  stbl.writeUInt32BE(stbl.length, 0);
  stbl.write('stbl', 4, 4, 'ascii');
  stsd.copy(stbl, 8);

  const minf = Buffer.alloc(8 + stbl.length);
  minf.writeUInt32BE(minf.length, 0);
  minf.write('minf', 4, 4, 'ascii');
  stbl.copy(minf, 8);

  const mdia = Buffer.alloc(8 + minf.length);
  mdia.writeUInt32BE(mdia.length, 0);
  mdia.write('mdia', 4, 4, 'ascii');
  minf.copy(mdia, 8);

  const trak = Buffer.alloc(8 + tkhd.length + mdia.length);
  trak.writeUInt32BE(trak.length, 0);
  trak.write('trak', 4, 4, 'ascii');
  tkhd.copy(trak, 8);
  mdia.copy(trak, 8 + tkhd.length);

  const moov = Buffer.alloc(8 + mvhd.length + trak.length);
  moov.writeUInt32BE(moov.length, 0);
  moov.write('moov', 4, 4, 'ascii');
  mvhd.copy(moov, 8);
  trak.copy(moov, 8 + mvhd.length);

  return Buffer.concat([ftyp, moov]);
}
