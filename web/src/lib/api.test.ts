import { describe, it, expect, vi } from 'vitest';
import { api, ApiError } from './api.ts';

describe('api', () => {
  describe('health', () => {
    it('returns health data on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true, data: { ffmpeg: 'ok', ffprobe: 'ok', llm: 'ok' } }),
      } as Response);

      const result = await api.health();
      expect(result.ffmpeg).toBe('ok');
      expect(result.llm).toBe('ok');
    });

    it('throws ApiError on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'boom' },
        }),
      } as Response);

      await expect(api.health()).rejects.toThrow(ApiError);
      await expect(api.health()).rejects.toThrow('boom');
    });
  });

  describe('getSettings', () => {
    it('returns settings object', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          ok: true,
          data: { KIMI_API_KEY: 'sk-test' },
        }),
      } as Response);

      const result = await api.getSettings();
      expect(result.KIMI_API_KEY).toBe('sk-test');
    });
  });

  describe('updateSettings', () => {
    it('sends PATCH request with settings', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true }),
      } as Response);
      global.fetch = fetchMock;

      await api.updateSettings({ KIMI_API_KEY: 'sk-new' });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ KIMI_API_KEY: 'sk-new' }),
        }),
      );
    });
  });
});
