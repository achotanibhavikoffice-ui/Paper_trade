import { useEffect, useState } from 'react';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { accountApi } from '../../api';
import type { Instrument } from '../../types';

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const defaultInstruments: Instrument[] = [
  { id: '1', symbol: 'RELIANCE', name: 'Reliance Industries Limited', exchange: 'NSE', instrument_type: 'EQUITY', sector: 'Energy', is_tradable: true, lot_size: 1, price: 1428.60, change: '+1.84%', up: true },
  { id: '2', symbol: 'TCS', name: 'Tata Consultancy Services Limited', exchange: 'NSE', instrument_type: 'EQUITY', sector: 'Information Technology', is_tradable: true, lot_size: 1, price: 3842.10, change: '+0.62%', up: true },
  { id: '3', symbol: 'HDFCBANK', name: 'HDFC Bank Limited', exchange: 'NSE', instrument_type: 'EQUITY', sector: 'Financial Services', is_tradable: true, lot_size: 1, price: 1716.45, change: '−0.38%', up: false },
  { id: '4', symbol: 'INFY', name: 'Infosys Limited', exchange: 'NSE', instrument_type: 'EQUITY', sector: 'Information Technology', is_tradable: true, lot_size: 1, price: 1890.20, change: '+1.20%', up: true },
  { id: '5', symbol: 'ICICIBANK', name: 'ICICI Bank Limited', exchange: 'NSE', instrument_type: 'EQUITY', sector: 'Financial Services', is_tradable: true, lot_size: 1, price: 1295.70, change: '+1.95%', up: true },
  { id: '6', symbol: 'TRENT', name: 'Trent Limited', exchange: 'NSE', instrument_type: 'EQUITY', sector: 'Consumer Discretionary', is_tradable: true, lot_size: 1, price: 6284.90, change: '+4.28%', up: true },
  { id: '7', symbol: 'BAJFINANCE', name: 'Bajaj Finance Limited', exchange: 'NSE', instrument_type: 'EQUITY', sector: 'Financial Services', is_tradable: true, lot_size: 1, price: 7125.00, change: '+3.16%', up: true },
];

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [instruments, setInstruments] = useState<Instrument[]>(defaultInstruments);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      accountApi.getInstruments()
        .then((data) => {
          if (data && data.length > 0) setInstruments(data);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = instruments.filter(
    (inst) =>
      inst.symbol.toLowerCase().includes(query.toLowerCase()) ||
      inst.name.toLowerCase().includes(query.toLowerCase()) ||
      (inst.sector && inst.sector.toLowerCase().includes(query.toLowerCase()))
  );

  function selectSymbol(symbol: string) {
    onClose();
    navigate(`/stocks/${symbol}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-slate-50/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search size={18} className="text-slate-500" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stocks by symbol, company, or sector... (e.g. RELIANCE, TCS)"
            className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-700 rounded-md hover:bg-slate-100"
            aria-label="Close search"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No matching stocks found for <strong className="text-slate-700">"{query}"</strong>
            </div>
          ) : (
            filtered.map((inst) => (
              <button
                key={inst.symbol}
                onClick={() => selectSymbol(inst.symbol)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-100/70 text-left transition-colors group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-sm text-slate-800">{inst.symbol}</strong>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200/50">
                      {inst.exchange}
                    </span>
                    {inst.sector && (
                      <span className="text-xs text-slate-500">{inst.sector}</span>
                    )}
                  </div>
                  <small className="text-xs text-slate-500 block mt-0.5">{inst.name}</small>
                </div>
                <div className="flex items-center gap-2">
                  {inst.price && (
                    <span className="text-sm font-semibold text-slate-700">
                      ₹{inst.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  <ArrowUpRight size={16} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 bg-slate-50/60 border-t border-slate-200 text-xs text-slate-500">
          <span>Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 text-slate-600">ESC</kbd> to exit</span>
          <span>Tip: Select a symbol to view candlestick charts & details</span>
        </div>
      </div>
    </div>
  );
}
