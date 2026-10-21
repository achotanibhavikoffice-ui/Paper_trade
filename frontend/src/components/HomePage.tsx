import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Check, Menu, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { User } from '../api';
import { Brand } from './Brand';
import './HomePage.css';

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

export function HomePage({ user }: { user: User | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const reduce = useReducedMotion();
  const closeMenu = () => setMenuOpen(false);

  return <main className="home-page" id="top">
    <header className="home-nav-wrap">
      <div className="home-nav">
        <Brand />
        <button className="home-menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="home-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav id="home-navigation" className={menuOpen ? 'home-nav-links is-open' : 'home-nav-links'} aria-label="Main navigation">
          <a href="#platform" onClick={closeMenu}>Platform</a>
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <a href="#about" onClick={closeMenu}>About Tradeo</a>
          <div className="home-nav-actions">
            {user ? <Link className="home-signin" to="/dashboard" onClick={closeMenu}>Open dashboard <ArrowUpRight size={16} /></Link> : <><Link className="home-signin" to="/login" onClick={closeMenu}>Sign in</Link><Link className="home-button home-button-small" to="/register" onClick={closeMenu}>Create free account <ArrowRight size={16} /></Link></>}
          </div>
        </nav>
      </div>
    </header>

    <section className="home-hero">
      <div className="home-hero-inner">
        <motion.div className="home-hero-copy" initial={reduce ? false : { opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}>
          <span className="home-kicker"><span className="kicker-mark"><Sparkles size={14} /></span> A calmer way to learn the market</span>
          <h1>Build your market instincts <em>before</em> the stakes are real.</h1>
          <p>Tradeo gives you a clear place to practice decisions, understand your portfolio, and learn at your own pace. Every order here is simulated.</p>
          <div className="home-hero-actions">
            <Link className="home-button" to={user ? '/dashboard' : '/register'}>{user ? 'Go to your dashboard' : 'Start practicing for free'} <ArrowRight size={18} /></Link>
            <a className="home-text-link" href="#platform">Explore the platform <ArrowDown size={16} /></a>
          </div>
          <div className="home-proof"><span><Check size={14} /> No real money</span><span><Check size={14} /> Learn by doing</span><span><Check size={14} /> Your own pace</span></div>
        </motion.div>

        <motion.div className="hero-visual" initial={reduce ? false : { opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.14, ease: [0.22, 1, 0.36, 1] }} aria-label="Illustrative paper trading portfolio preview">
          <div className="visual-grid" />
          <div className="visual-window">
            <div className="visual-window-top"><span className="visual-brand"><i /> TRADEO / PRACTICE</span><span className="visual-period">MARKET OVERVIEW <span>•</span> DEMO</span></div>
            <div className="visual-greeting"><span>YOUR PRACTICE PORTFOLIO</span><small>Illustrative data</small></div>
            <div className="visual-balance"><strong>₹1,24,680</strong><span>+2.18% <ArrowUpRight size={14} /></span></div>
            <div className="visual-chart"><div className="visual-chart-lines"><i /><i /><i /><i /></div><svg viewBox="0 0 620 180" preserveAspectRatio="none" role="img" aria-label="Decorative portfolio performance line"><path className="visual-chart-fill" d="M0 147 C26 144 37 118 65 128 S102 142 126 112 S166 127 194 97 S230 115 260 84 S303 101 329 64 S367 80 394 59 S430 77 457 48 S501 62 526 35 S576 45 620 12 L620 180 L0 180Z"/><path className="visual-chart-line" d="M0 147 C26 144 37 118 65 128 S102 142 126 112 S166 127 194 97 S230 115 260 84 S303 101 329 64 S367 80 394 59 S430 77 457 48 S501 62 526 35 S576 45 620 12"/></svg><span className="chart-point" /></div>
            <div className="visual-chart-labels"><span>9:15</span><span>11:00</span><span>12:45</span><span>3:30</span></div>
            <div className="visual-assets"><div><span className="asset-token token-blue">R</span><span><b>RELIANCE</b><small>24 shares</small></span><strong>₹1,428.60</strong><i>+1.84%</i></div><div><span className="asset-token token-sand">T</span><span><b>TCS</b><small>12 shares</small></span><strong>₹3,842.10</strong><i>+0.62%</i></div></div>
          </div>
          <div className="visual-float visual-float-top"><span><ShieldCheck size={17} /></span><div><b>Practice with confidence</b><small>Simulated orders only</small></div><Check size={17} /></div>
          <div className="visual-float visual-float-bottom"><span className="float-stat-icon"><BarChart3 size={18} /></span><div><small>PORTFOLIO TREND</small><b>Learn from every decision</b></div><ArrowUpRight size={16} /></div>
          <div className="visual-orbit orbit-a" /><div className="visual-orbit orbit-b" />
        </motion.div>
      </div>
      <a href="#platform" className="hero-scroll-cue"><span /> Scroll to explore</a>
    </section>

    <section className="home-ticker" aria-label="Illustrative market snapshot"><div className="ticker-inner"><span className="ticker-title"><i /> MARKET SNAPSHOT <small>ILLUSTRATIVE</small></span><div><span>NIFTY 50</span><b>24,812.35</b><i>+0.84%</i></div><div><span>SENSEX</span><b>81,559.54</b><i>+0.79%</i></div><div><span>BANK NIFTY</span><b>52,614.20</b><i className="ticker-down">−0.18%</i></div><p>Sample values for product preview</p></div></section>

    <section className="home-section platform-section" id="platform">
      <div className="home-section-head"><Reveal><span className="home-eyebrow">A PRACTICE SPACE BUILT AROUND YOU</span><h2>Everything you need to learn by doing.</h2><p>Explore the building blocks of a more thoughtful investing routine, without putting real capital at risk.</p></Reveal></div>
      <div className="feature-grid">
        <Reveal delay={0.04} className="feature-card feature-card-blue"><span className="feature-icon"><BarChart3 size={21} /></span><span className="feature-number">01 / PRACTICE</span><h3>Try a decision.<br />See what follows.</h3><p>Use a simulated portfolio to explore order choices and understand how they can affect your positions.</p><a href="#how-it-works">Explore practice <ArrowRight size={16} /></a><div className="feature-decoration feature-bars"><i /><i /><i /><i /><i /><i /><i /></div></Reveal>
        <Reveal delay={0.12} className="feature-card feature-card-sand"><span className="feature-icon"><BookOpen size={21} /></span><span className="feature-number">02 / UNDERSTAND</span><h3>Make the numbers<br />make sense.</h3><p>Review portfolio value, position changes, and market context in a dashboard designed for clarity.</p><a href="#how-it-works">See the workflow <ArrowRight size={16} /></a><div className="feature-decoration feature-rings"><i /><i /><i /></div></Reveal>
        <Reveal delay={0.2} className="feature-card feature-card-white"><span className="feature-icon"><ShieldCheck size={21} /></span><span className="feature-number">03 / BUILD CONFIDENCE</span><h3>Learn in a space<br />made for practice.</h3><p>Start with a simple, guided experience and build your understanding one thoughtful step at a time.</p><a href="#principle">Why practice matters <ArrowRight size={16} /></a><div className="feature-decoration feature-check"><Check size={60} /></div></Reveal>
      </div>
    </section>

    <section className="home-process" id="how-it-works">
      <div className="process-inner"><Reveal className="process-intro"><span className="home-eyebrow">A SIMPLE PLACE TO START</span><h2>From first login<br />to first insight.</h2><p>No complicated setup. Just a clear path from exploring the product to reviewing your decisions.</p><Link to={user ? '/dashboard' : '/register'} className="home-dark-link">{user ? 'Return to workspace' : 'Create your workspace'} <ArrowRight size={17} /></Link></Reveal>
        <div className="process-steps"><Reveal delay={0.05} className="process-step"><span className="step-index">01</span><div><h3>Create your workspace</h3><p>Register for your personal practice account and open your dashboard.</p></div><span className="step-check"><Check size={17} /></span></Reveal><Reveal delay={0.15} className="process-step"><span className="step-index">02</span><div><h3>Explore and practice</h3><p>Review the market preview and experiment with simulated order choices.</p></div><span className="step-check"><BarChart3 size={17} /></span></Reveal><Reveal delay={0.25} className="process-step"><span className="step-index">03</span><div><h3>Reflect on your portfolio</h3><p>Use clear portfolio summaries to understand what changed and why.</p></div><span className="step-check"><ArrowUpRight size={17} /></span></Reveal></div>
      </div>
    </section>

    <section className="home-about" id="about"><div className="about-inner"><Reveal className="about-copy"><span className="home-eyebrow">ABOUT TRADEO</span><h2>Market learning should start in a space where it’s safe to make a choice.</h2><p>Tradeo is being built to make market mechanics easier to understand. Explore simulated orders, see how a portfolio is presented, and build a repeatable learning routine before making decisions with real capital.</p><Link to="/register" className="home-dark-link">Meet your practice workspace <ArrowRight size={17} /></Link></Reveal><Reveal className="about-values" delay={0.12}><div><span>01</span><strong>Practice-first</strong><p>A safe place to explore the mechanics of market decisions.</p></div><div><span>02</span><strong>Clear by design</strong><p>Portfolio context that makes changes easier to follow.</p></div><div><span>03</span><strong>Built to grow</strong><p>A foundation for thoughtful, informed market learning.</p></div></Reveal></div></section>

    <section className="home-principle" id="principle"><Reveal className="principle-card"><span className="principle-mark">“</span><span className="home-eyebrow">A TRADEO PRACTICE PRINCIPLE</span><blockquote>Good decisions grow from a process you understand, not a prediction you hope is right.</blockquote><p>Practice is a way to slow down, ask better questions, and learn from the choices you make.</p><span className="principle-rule" /></Reveal></section>

    <section className="home-cta"><Reveal className="home-cta-inner"><div><span className="home-eyebrow">YOUR NEXT STEP</span><h2>Start with practice.<br /><em>Build from there.</em></h2><p>Create an account and explore your own market practice workspace.</p></div><Link to={user ? '/dashboard' : '/register'} className="home-button home-button-light">{user ? 'Open your dashboard' : 'Create a free account'} <ArrowRight size={18} /></Link><div className="cta-index">TRADEO <span>—</span> LEARN BY DOING</div></Reveal></section>

    <footer className="home-footer"><div className="footer-main"><Link className="footer-logo-lockup" to="/" aria-label="Tradeo home"><img src="/brand/tradeo-logo.png" alt="Tradeo bull and candlestick logo" /></Link><p>Market practice made clearer.<br />A simulated environment for learning.</p><nav aria-label="Footer navigation"><a href="#platform">Platform</a><a href="#how-it-works">How it works</a><Link to="/login">Sign in</Link></nav><Link className="footer-create" to={user ? '/dashboard' : '/register'}>{user ? 'Dashboard' : 'Create account'} <ArrowUpRight size={16} /></Link></div><div className="footer-bottom"><span>© 2026 Tradeo</span><span><ShieldCheck size={14} /> Paper trading only. No real orders are placed.</span><a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }}>Back to top ↑</a></div></footer>
  </main>;
}
