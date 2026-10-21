import { Link } from 'react-router-dom';

export function Brand() {
  return <Link className="brand" to="/" aria-label="Quantx home"><img className="brand-symbol" src="/brand/quantx-mark.png" alt="" /><span className="brand-wordmark">Quantx<span className="brand-period">.</span></span></Link>;
}
