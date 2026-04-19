import { ServiceManager } from '../services/ServiceManager';
import { createSuccessResponse } from '../utils';

export async function handleHealthCheck(request: Request, serviceManager: ServiceManager): Promise<Response> {
  return createSuccessResponse({ status: 'ok' });
}

export async function handleStatsRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  return createSuccessResponse({ status: 'ok', info: 'Resonance API is running' });
}
