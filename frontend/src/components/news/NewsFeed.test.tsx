import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsArticle, NewsResponse } from '../../api';
import { newsApi } from '../../api';
import { NewsFeed } from './NewsFeed';
import { safeArticleUrl } from './newsUtils';

vi.mock('../../api', () => ({ newsApi: { list: vi.fn(), company: vi.fn() } }));

const list = vi.mocked(newsApi.list);
const company = vi.mocked(newsApi.company);

function article(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id: 'a1',
    title: 'Tesla beats expectations',
    description: 'Quarterly results beat.',
    snippet: null,
    source: 'example.com',
    url: 'https://example.com/a1',
    image_url: null,
    published_at: '2026-10-09T01:00:00Z',
    language: 'en',
    entities: [
      { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: null, country: 'us', type: 'equity', industry: null, match_score: 3, sentiment_score: 0.5, sentiment_label: 'positive' },
    ],
    sentiment_score: 0.5,
    sentiment_label: 'positive',
    ...overrides,
  };
}

function response(items: NewsArticle[], overrides: Partial<NewsResponse> = {}): NewsResponse {
  return {
    items,
    page: 1,
    limit: 3,
    returned: items.length,
    found: items.length,
    has_more: false,
    fetched_at: '2026-10-09T09:00:00Z',
    cached: false,
    stale: false,
    notice: null,
    ...overrides,
  };
}

beforeEach(() => {
  list.mockReset();
  company.mockReset();
});
afterEach(cleanup);

describe('NewsFeed', () => {
  it('shows loading skeletons then articles with safe external links', async () => {
    list.mockResolvedValue(response([article()]));
    render(<NewsFeed />);
    expect(screen.getAllByTestId('news-skeleton')).toHaveLength(3);
    expect(await screen.findByText('Tesla beats expectations')).toBeInTheDocument();
    expect(screen.queryByTestId('news-skeleton')).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Tesla beats expectations' });
    expect(link).toHaveAttribute('href', 'https://example.com/a1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('TSLA')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    list.mockResolvedValue(response([]));
    render(<NewsFeed />);
    expect(await screen.findByText('No articles found')).toBeInTheDocument();
  });

  it('shows an error with retry that recovers', async () => {
    list.mockRejectedValueOnce(new Error('The news provider is rate limiting requests.'));
    list.mockResolvedValueOnce(response([article()]));
    render(<NewsFeed />);
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limiting');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Tesla beats expectations')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('handles missing description, image and sentiment without inventing data', async () => {
    list.mockResolvedValue(
      response([article({ description: null, snippet: null, image_url: null, sentiment_label: null, sentiment_score: null, entities: [] })]),
    );
    render(<NewsFeed />);
    expect(await screen.findByText(/No description provided/)).toBeInTheDocument();
    const card = screen.getByTestId('news-card');
    expect(card).not.toHaveTextContent(/Positive|Negative|Neutral/);
  });

  it('does not render a link for an unsafe article URL', async () => {
    list.mockResolvedValue(response([article({ url: 'javascript:alert(1)' })]));
    render(<NewsFeed />);
    await screen.findByText('Tesla beats expectations');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('applies sentiment filter and loads more pages', async () => {
    list.mockResolvedValueOnce(response([article()], { has_more: true }));
    render(<NewsFeed />);
    await screen.findByText('Tesla beats expectations');
    list.mockResolvedValueOnce(response([article({ id: 'a2', title: 'Second story' })], { page: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Second story')).toBeInTheDocument();
    expect(screen.getByText('Tesla beats expectations')).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));

    list.mockResolvedValueOnce(response([]));
    fireEvent.click(screen.getByRole('tab', { name: 'Negative' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ sentiment: 'negative', page: 1 })));
  });

  it('flags stale data', async () => {
    list.mockResolvedValue(response([article()], { stale: true, notice: 'Live news is temporarily unavailable.' }));
    render(<NewsFeed />);
    expect(await screen.findByRole('status')).toHaveTextContent('may be out of date');
  });

  it('uses the company endpoint in company mode', async () => {
    company.mockResolvedValue(response([]));
    render(<NewsFeed symbol="RELIANCE" exchange="NSE" companyName="Reliance Industries Limited" />);
    expect(await screen.findByText(/may not cover this symbol/)).toBeInTheDocument();
    expect(company).toHaveBeenCalledWith('RELIANCE', expect.objectContaining({ exchange: 'NSE', page: 1 }));
    expect(list).not.toHaveBeenCalled();
  });
});

describe('safeArticleUrl', () => {
  it('allows only http(s) URLs', () => {
    expect(safeArticleUrl('https://a.com/x')).toBe('https://a.com/x');
    expect(safeArticleUrl('http://a.com')).toBe('http://a.com/');
    expect(safeArticleUrl('javascript:alert(1)')).toBeNull();
    expect(safeArticleUrl('data:text/html,hi')).toBeNull();
    expect(safeArticleUrl('not a url')).toBeNull();
    expect(safeArticleUrl(null)).toBeNull();
  });
});
