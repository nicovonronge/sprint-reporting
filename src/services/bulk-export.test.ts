import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { zipFiles, toCsv } from './bulk-export.js';

/** Reads the central directory back so the test does not depend on an unzip tool. */
function readZip(buf: Buffer): Record<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out[name] = inflateRawSync(buf.subarray(dataStart, dataStart + size)).toString('utf8');
    p += 46 + nameLen;
  }
  return out;
}

describe('zipFiles', () => {
  it('round-trips names and content, including non-ASCII', () => {
    const zip = zipFiles([{ name: 'a.txt', data: 'hello' }, { name: 'people/Zoë.json', data: '{"x":1}' }]);
    expect(readZip(zip)).toEqual({ 'a.txt': 'hello', 'people/Zoë.json': '{"x":1}' });
  });
});

describe('toCsv', () => {
  it('quotes, escapes and neutralises formulas', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['=SUM(A1)', null], [1.5, true]]);
    expect(csv).toBe('﻿a,b\r\n"x,y","say ""hi"""\r\n\'=SUM(A1),\r\n1.5,true\r\n');
  });
});
