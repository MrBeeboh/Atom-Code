import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectGitHubContextIfPresent, parseGitHubUrl } from './github.js';

describe('GitHub context', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('/repos/sveltejs/svelte/contents/README.md')) {
        return {
          ok: true,
          json: async () => ({
            content: btoa('# sveltejs/svelte\n\nMock README content for testing.'),
            encoding: 'base64'
          })
        };
      }
      if (url.includes('/git/trees/main')) {
        return {
          ok: true,
          json: async () => ({
            tree: [
              { path: 'README.md', type: 'blob' },
              { path: 'package.json', type: 'blob' }
            ]
          })
        };
      }
      if (url.includes('/repos/sveltejs/svelte')) {
        return {
          ok: true,
          json: async () => ({ default_branch: 'main' })
        };
      }
      return { ok: false, status: 404 };
    }));

    return () => vi.unstubAllGlobals();
  });

  it('injectGitHubContextIfPresent returns repo context for a message with a GitHub URL', async () => {
    const message = 'Summarize the README from github.com/sveltejs/svelte';
    const result = await injectGitHubContextIfPresent(message);

    expect(result).toBeTypeOf('string');
    expect(result.length).toBeGreaterThan(100);
    expect(result).toContain('sveltejs/svelte');
    expect(result).toContain('Repository:');
    // Should include at least README or package.json content
    expect(result).toMatch(/README|package\.json|file list/i);
    expect(result).toContain('Mock README content');
  });
});

describe('parseGitHubUrl', () => {
  it('parses github.com/owner/repo from text', () => {
    expect(parseGitHubUrl('see github.com/sveltejs/svelte')).toEqual({ owner: 'sveltejs', repo: 'svelte' });
  });
  it('returns null when no URL', () => {
    expect(parseGitHubUrl('no url here')).toBeNull();
  });
});
