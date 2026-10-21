import { useState } from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';
import type { NewsArticle } from '../../api';
import { entityLabel, formatPublished, safeArticleUrl, sentimentStyles } from './newsUtils';

function SentimentBadge({ label, prefix }: { label: string | null; prefix?: string }) {
  if (!label || !sentimentStyles[label]) return null;
  const style = sentimentStyles[label];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${style.className}`}>
      {prefix}
      {style.label}
    </span>
  );
}

export function NewsCard({ article }: { article: NewsArticle }) {
  const [imageFailed, setImageFailed] = useState(false);
  const href = safeArticleUrl(article.url);
  const imageUrl = safeArticleUrl(article.image_url);
  const published = formatPublished(article.published_at);
  const summary = article.description ?? article.snippet;
  const entities = article.entities.filter((e) => e.symbol || e.name).slice(0, 6);

  return (
    <article className="flex gap-4 rounded-xl border border-slate-200 bg-white/60 p-4 transition-colors hover:border-slate-200" data-testid="news-card">
      <div className="hidden h-24 w-36 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:block">
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-600" aria-hidden="true">
            <Newspaper size={26} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {article.source && <strong className="font-semibold text-slate-600">{article.source}</strong>}
          {published && (
            <time dateTime={article.published_at ?? undefined} title={`Published ${published.absolute}`}>
              Published {published.relative}
            </time>
          )}
          <SentimentBadge label={article.sentiment_label} />
        </div>

        <h3 className="text-base font-semibold leading-snug text-slate-800">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-blue-400">
              {article.title}
            </a>
          ) : (
            article.title
          )}
        </h3>

        {summary ? (
          <p className="mt-1 line-clamp-3 text-sm text-slate-500">{summary}</p>
        ) : (
          <p className="mt-1 text-sm italic text-slate-500">No description provided by the source.</p>
        )}

        {entities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Companies mentioned">
            {entities.map((entity) => (
              <span
                key={`${entity.symbol}-${entity.name}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                title={entity.name ?? undefined}
              >
                <strong className="font-semibold text-slate-800">{entityLabel(entity)}</strong>
                {entity.symbol && entity.name && <span className="max-w-[10rem] truncate text-slate-500">{entity.name}</span>}
                <SentimentBadge label={entity.sentiment_label} />
              </span>
            ))}
          </div>
        )}

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline"
          >
            Read original on {article.source ?? 'source'} <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

export function NewsCardSkeleton() {
  return (
    <div className="flex animate-pulse gap-4 rounded-xl border border-slate-200 bg-white/40 p-4" data-testid="news-skeleton">
      <div className="hidden h-24 w-36 shrink-0 rounded-lg bg-slate-100/60 sm:block" />
      <div className="flex-1 space-y-2.5">
        <div className="h-3 w-1/4 rounded bg-slate-100" />
        <div className="h-5 w-3/4 rounded bg-slate-700/60" />
        <div className="h-3 w-full rounded bg-slate-100/80" />
        <div className="h-3 w-2/3 rounded bg-slate-100/80" />
      </div>
    </div>
  );
}
