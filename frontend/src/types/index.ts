export type { AccountInfo, Holding, Instrument, LedgerEntry, Order, OrderProduct, OrderSide, OrderStatus, OrderType, Position, Quote, Trade, User } from '../api';
export type { NewsArticle, NewsEntity, NewsParams, NewsResponse, SentimentLabel } from '../api';

export type AppNotification = {
  id: string; title: string; message: string;
  category: 'SECURITY' | 'ACCOUNT' | 'MARKET' | 'SYSTEM'; read: boolean; created_at: string;
};

export type Lesson = {
  id: string;
  title: string;
  category: string;
  summary: string;
  read_time: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  objectives: string[];
  content: string;
  key_takeaways: string[];
  quiz?: { question: string; options: string[]; answer_index: number; explanation: string };
};
