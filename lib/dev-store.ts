import type { JobApplication, MasterProfile } from '@/lib/domain/schema';

type DevStore = { profile: MasterProfile | null; applications: JobApplication[] };
const key = '__tailorcv_dev_store__';

export function getDevStore(): DevStore {
  const scope = globalThis as typeof globalThis & { [key]?: DevStore };
  scope[key] ??= { profile: null, applications: [] };
  return scope[key];
}
