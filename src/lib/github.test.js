import { describe, it, expect } from 'vitest';
import { injectGitHubContextIfPresent, parseGitHubUrl } from './github.js';

describe('GitHub context', () => {
  it('injectGitHubContextIfPresent returns repo context for a message with a GitHub URL', async () => {
    const message = 'Summarize the README from github.com/sveltejs/svelte';
    const result = await injectGitHubContextIfPresent(message);

    expect(result).toBeTypeOf('string');
    expect(result.length).toBeGreaterThan(100);
    expect(result).toContain('sveltejs/svelte');
    expect(result).toContain('Repository:');
    // Should include at least README or package.json content
    expect(result).toMatch(/README|package\.json|file list/i);
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
