import path from 'path';

export function fixtureUploadPath(name: string): string {
  return path.resolve(__dirname, '..', 'data', 'uploads', name);
}
