import { Link } from 'react-router-dom';

export function Brand() {
  return <Link className="brand" to="/" aria-label="Tradeo home"><img className="brand-symbol" src="/brand/tradeo-mark.png" alt="" /><span className="brand-wordmark">Tradeo<span className="brand-period">.</span></span></Link>;
}
