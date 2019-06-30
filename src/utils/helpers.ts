import process from 'process';

export function isProduction() {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  return NODE_ENV === 'production';
}

export async function msleep(time: number): Promise<void> {
  return new Promise(resolve => setTimeout(_ => resolve(), time))
}