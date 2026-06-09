import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiError } from './api.ts';

// fileUrl + API_BASE are computed from window.location.protocol at module load,
// so we re-import the module fresh under each simulated protocol.
async function loadApiUnder(protocol: string) {
  vi.resetModules();
  vi.stubGlobal('window', {
    location: { protocol },
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  return import('./api.ts');
}

describe('fileUrl (ORB same-origin fix regression guard)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('under app:// returns the path UNCHANGED so images/video are same-origin', async () => {
    // The ORB bug: routing /files through http://127.0.0.1 made <img>/<video>
    // cross-origin → Chromium ERR_BLOCKED_BY_ORB. Same-origin app:// fixes it.
    const { fileUrl } = await loadApiUnder('app:');
    expect(fileUrl('/files/uploads/x/video.mp4')).toBe('/files/uploads/x/video.mp4');
    expect(fileUrl('/files/a.png')).toBe('/files/a.png');
  });

  it('under file:// (legacy build) prefixes the local server origin', async () => {
    const { fileUrl } = await loadApiUnder('file:');
    expect(fileUrl('/files/a.png')).toBe('http://127.0.0.1:4000/files/a.png');
  });

  it('under http:// (dev) returns the relative path (vite proxy)', async () => {
    const { fileUrl } = await loadApiUnder('http:');
    expect(fileUrl('/files/a.png')).toBe('/files/a.png');
  });

  it('passes through absolute/blob/data URLs untouched in every mode', async () => {
    for (const proto of ['app:', 'file:', 'http:']) {
      const { fileUrl } = await loadApiUnder(proto);
      expect(fileUrl('https://cdn/x.png')).toBe('https://cdn/x.png');
      expect(fileUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
      expect(fileUrl('blob:abc')).toBe('blob:abc');
    }
  });

  it('returns empty string for null/undefined/empty', async () => {
    const { fileUrl } = await loadApiUnder('app:');
    expect(fileUrl(null)).toBe('');
    expect(fileUrl(undefined)).toBe('');
    expect(fileUrl('')).toBe('');
  });
});

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
