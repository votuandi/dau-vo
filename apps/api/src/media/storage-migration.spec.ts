import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { LocalStore, localPath, parity } from './storage-migration';

describe('storage migration primitives', () => {
  const key = 'athletes/11111111-1111-1111-1111-111111111111.jpg';

  it('inspects legacy JPEG bytes without changing them', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'media-migration-'));
    const filename = localPath(root, key);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const before = await new LocalStore(root).inspect(key, true);
    const after = await new LocalStore(root).inspect(key, true);
    expect(before).toEqual(after);
    expect(before).toMatchObject({ exists: true, size: 4 });
  });

  it('rejects traversal and keys outside the media contract before filesystem access', () => {
    expect(() => localPath('C:\\uploads', '../secrets.jpg')).toThrow(
      'unsafe storage key',
    );
    expect(() => localPath('C:\\uploads', 'athletes/not-a-uuid.webp')).toThrow(
      'unsafe storage key',
    );
  });

  it('distinguishes absent destinations from equal and conflicting objects', () => {
    const source = { exists: true, size: 3, sha256: 'abc' };
    expect(parity(source, { exists: false })).toBe('copy');
    expect(parity(source, { exists: true, size: 3, sha256: 'abc' })).toBe(
      'equal',
    );
    expect(parity(source, { exists: true, size: 3, sha256: 'def' })).toBe(
      'conflict',
    );
    expect(parity({ exists: false }, { exists: false })).toBe('missing-source');
    expect(parity(source, { exists: false, error: 'S3 HEAD 403' })).toBe(
      'unsafe',
    );
  });
});
