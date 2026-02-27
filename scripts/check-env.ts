// Simple script to check environment variables
// This is intended to be run in a Node environment or imported.
// For the browser, we use import.meta.env

export function checkEnvVariables() {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_ADMIN_USERNAME',
    'VITE_ADMIN_PASSWORD'
  ];

  const missing: string[] = [];

  // specific check for browser vs node
  const getEnv = (key: string) => {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env[key];
    }
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
    return undefined;
  };

  required.forEach(key => {
    if (!getEnv(key)) {
      missing.push(key);
    }
  });

  if (missing.length > 0) {
    const errorMsg = `MISSING ENVIRONMENT VARIABLES:\n${missing.join('\n')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  console.log('Environment variables check passed.');
}
