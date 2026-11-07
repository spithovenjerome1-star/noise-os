import "server-only";
// STUB — implemented by the packages module. Contract used by automations:
// Creates any missing package periods for active recurring packages up to today
// (Europe/Malta), closing finished ones and applying rollover rules. Idempotent.
export async function ensurePackagePeriods(_today?: string): Promise<{ created: number; closed: number }> {
  return { created: 0, closed: 0 };
}
