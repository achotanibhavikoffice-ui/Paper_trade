import { NewsFeed } from '../components/news/NewsFeed';
import { PageHeader } from '../components/common/PageHeader';

export function NewsPage() {
  return (
    <>
      <PageHeader
        title="Market News"
        eyebrow="HEADLINES & SENTIMENT"
        description="Recent financial news with the companies involved and automatically scored sentiment."
        breadcrumbs={[{ label: 'Market News' }]}
      />
      <NewsFeed />
    </>
  );
}
