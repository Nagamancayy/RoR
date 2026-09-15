export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadMasterKey } = await import('./lib/crypto/secret-store');
    // Validate before serving requests; production never silently generates a master key.
    loadMasterKey();
  }
}
