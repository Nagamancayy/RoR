'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  CircleDot,
  FlaskConical,
  History,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Plus,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const navigation = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/experiments/new', label: 'New experiment', icon: FlaskConical },
  { href: '/history', label: 'Experiment history', icon: History },
  { href: '/statistics', label: 'Statistics', icon: ChartNoAxesCombined },
  { href: '/experiments/manual', label: 'Manual / Educational', icon: BookOpen },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (menu) sidebar.current?.querySelector<HTMLAnchorElement>('a')?.focus();
  }, [menu]);
  function closeMenu() {
    setMenu(false);
    if (menu) menuButton.current?.focus();
  }
  const title =
    pathname === '/'
      ? 'Overview'
      : pathname === '/experiments/new'
        ? 'New experiment'
        : pathname === '/history'
          ? 'Experiment history'
          : pathname === '/statistics'
            ? 'Statistics'
            : pathname === '/learn'
              ? 'Field guide'
              : pathname.endsWith('/result')
                ? 'Experiment result'
                : 'Experiment console';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menu && (
        <button className="mobile-backdrop" aria-label="Close navigation" onClick={closeMenu} />
      )}
      <aside
        ref={sidebar}
        className={`sidebar ${menu ? 'is-open' : ''}`}
        onKeyDown={(event) => {
          if (!menu) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu();
          }
          if (event.key === 'Tab') {
            const links = sidebar.current?.querySelectorAll<HTMLElement>('a, button');
            const first = links?.[0];
            const last = links?.[links.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <Link href="/" className="brand" onClick={closeMenu} aria-label="Real or Random Lab home">
          <span className="brand-mark">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>
            Real or Random<span className="brand-subtitle">CRYPTOGRAPHIC LAB</span>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={closeMenu}
        >
          <X size={20} />
        </button>
        <Link className="button primary sidebar-start" href="/experiments/new" onClick={closeMenu}>
          <Plus size={17} aria-hidden="true" /> Start experiment
        </Link>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${pathname === href ? 'selected' : ''}`}
              aria-current={pathname === href ? 'page' : undefined}
              onClick={closeMenu}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
              {pathname === href && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="nav-label resources-label">RESOURCES</div>
        <nav aria-label="Resources">
          <Link
            href="/learn"
            className={`nav-item ${pathname === '/learn' ? 'selected' : ''}`}
            onClick={closeMenu}
            aria-current={pathname === '/learn' ? 'page' : undefined}
          >
            <BookOpen size={18} aria-hidden="true" />
            Field guide
            <ArrowUpRight className="nav-end" size={15} aria-hidden="true" />
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <LockKeyhole size={16} aria-hidden="true" />
            </span>
            <div>
              <strong>Your lab. Your data.</strong>
              <p>Secrets local. AI sees public observations.</p>
            </div>
          </div>
          <div className="sidebar-version">
            <span>
              <CircleDot size={12} aria-hidden="true" /> Local workspace
            </span>
            <span>v2.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={menuButton}
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-root">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <span>{title}</span>
          </div>
          <div className="topbar-status">
            <Activity size={14} aria-hidden="true" />
            <span>Local research environment</span>
            <span className="environment-dot" />
          </div>
        </header>
        <main id="main-content" className="main-content">
          {children}
          <footer className="page-footer">
            <span>
              Real or Random Lab <span className="muted">/</span> An open cryptography workspace
            </span>
            <Link href="/learn">
              Understand the experiment <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
