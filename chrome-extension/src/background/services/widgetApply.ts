import type { ServerApiClient } from './server/apiClient';

type ValidMethod = 'post' | 'patch';

type ValidationSuccess = { valid: true; normalizedMethod: ValidMethod };
type ValidationFailure = { valid: false; error: string };
type ValidationResult = ValidationSuccess | ValidationFailure;

export function validateWidgetApplyRequest(endpoint: unknown, method: unknown): ValidationResult {
  if (typeof endpoint !== 'string' || !(endpoint.startsWith('/api/') || endpoint.startsWith('/ai/'))) {
    return { valid: false, error: 'Invalid endpoint' };
  }

  const normalized = (typeof method === 'string' ? method : '').toLowerCase();
  if (normalized !== 'post' && normalized !== 'patch') {
    return { valid: false, error: 'Invalid method' };
  }

  return { valid: true, normalizedMethod: normalized };
}

export async function executeWidgetApply(
  apiClient: ServerApiClient,
  request: { endpoint: unknown; method: unknown; payload: unknown },
): Promise<{ success: true } | { success: false; error: string }> {
  const validation = validateWidgetApplyRequest(request.endpoint, request.method);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    if (validation.normalizedMethod === 'post') {
      await apiClient.post(request.endpoint as string, request.payload);
    } else {
      await apiClient.patch(request.endpoint as string, request.payload);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Widget apply failed' };
  }
}
