import { describe, it, expect, vi } from 'vitest';
import type { ServerApiClient } from '../server/apiClient';
import { validateWidgetApplyRequest, executeWidgetApply } from '../widgetApply';

function createMockApiClient() {
  return {
    post: vi.fn().mockResolvedValue({ data: null, status: 200, headers: new Headers() }),
    patch: vi.fn().mockResolvedValue({ data: null, status: 200, headers: new Headers() }),
  } as unknown as ServerApiClient;
}

describe('validateWidgetApplyRequest', () => {
  it('accepts /api/ endpoint', () => {
    expect(validateWidgetApplyRequest('/api/rates', 'post')).toEqual({ valid: true, normalizedMethod: 'post' });
  });

  it('accepts /ai/ endpoint', () => {
    expect(validateWidgetApplyRequest('/ai/query', 'patch')).toEqual({ valid: true, normalizedMethod: 'patch' });
  });

  it('rejects arbitrary endpoint', () => {
    expect(validateWidgetApplyRequest('/admin/delete', 'post')).toEqual({ valid: false, error: 'Invalid endpoint' });
  });

  it('rejects non-string endpoint', () => {
    expect(validateWidgetApplyRequest(123, 'post')).toEqual({ valid: false, error: 'Invalid endpoint' });
  });

  it('rejects empty string endpoint', () => {
    expect(validateWidgetApplyRequest('', 'post')).toEqual({ valid: false, error: 'Invalid endpoint' });
  });

  it('normalizes POST to post', () => {
    expect(validateWidgetApplyRequest('/api/x', 'POST')).toEqual({ valid: true, normalizedMethod: 'post' });
  });

  it('normalizes PATCH to patch', () => {
    expect(validateWidgetApplyRequest('/api/x', 'PATCH')).toEqual({ valid: true, normalizedMethod: 'patch' });
  });

  it('rejects GET method', () => {
    expect(validateWidgetApplyRequest('/api/x', 'GET')).toEqual({ valid: false, error: 'Invalid method' });
  });

  it('rejects DELETE method', () => {
    expect(validateWidgetApplyRequest('/api/x', 'DELETE')).toEqual({ valid: false, error: 'Invalid method' });
  });
});

describe('executeWidgetApply', () => {
  it('calls post for post method', async () => {
    const api = createMockApiClient();
    const result = await executeWidgetApply(api, { endpoint: '/api/rates', method: 'post', payload: {} });
    expect(result).toEqual({ success: true });
    expect(api.post).toHaveBeenCalledOnce();
  });

  it('calls patch for patch method', async () => {
    const api = createMockApiClient();
    const result = await executeWidgetApply(api, { endpoint: '/api/rates', method: 'patch', payload: {} });
    expect(result).toEqual({ success: true });
    expect(api.patch).toHaveBeenCalledOnce();
  });

  it('passes endpoint and payload correctly', async () => {
    const api = createMockApiClient();
    await executeWidgetApply(api, { endpoint: '/api/rates', method: 'post', payload: { rate: 100 } });
    expect(api.post).toHaveBeenCalledWith('/api/rates', { rate: 100 });
  });

  it('returns error message on Error throw', async () => {
    const api = createMockApiClient();
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'));
    const result = await executeWidgetApply(api, { endpoint: '/api/rates', method: 'post', payload: {} });
    expect(result).toEqual({ success: false, error: 'Network error' });
  });

  it('returns fallback error on non-Error throw', async () => {
    const api = createMockApiClient();
    vi.mocked(api.post).mockRejectedValueOnce('something went wrong');
    const result = await executeWidgetApply(api, { endpoint: '/api/rates', method: 'post', payload: {} });
    expect(result).toEqual({ success: false, error: 'Widget apply failed' });
  });

  it('skips API call for invalid request', async () => {
    const api = createMockApiClient();
    const result = await executeWidgetApply(api, { endpoint: '/admin/delete', method: 'post', payload: {} });
    expect(result).toEqual({ success: false, error: 'Invalid endpoint' });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });
});
