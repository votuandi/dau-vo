import { chmod, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Vite copies public files with their source permissions. Git does not preserve
// read bits; a restrictive checkout umask can leave them unreadable to nginx.
export async function normalizeStaticPermissions(directory) {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await normalizeStaticPermissions(path);
    else if (entry.isFile()) await chmod(path, 0o644);
    else throw new Error(`Unexpected non-regular static asset: ${path}`);
  }
}
