'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  Briefcase, Search, Eye, FolderOpen, LogOut, ClipboardList,
  ChevronDown, Shield, BarChart3, PieChart, FileText, Scale, DollarSign,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const NAV_GROUPS = [
  {
    label: 'CIO Suite',
    icon: Briefcase,
    items: [
      { href: '/holdings', label: 'Holdings', icon: Briefcase },
      { href: '/holdings?tab=risk', label: 'Risk', icon: Shield },
      { href: '/holdings?tab=factors', label: 'Factors', icon: BarChart3 },
      { href: '/allocation', label: 'Allocation', icon: PieChart },
    ],
    // Active if any child route is active
    matchPaths: ['/holdings', '/allocation'],
  },
  {
    label: 'Equity Research',
    icon: Search,
    items: [
      { href: '/watchlist', label: 'Watchlist', icon: Eye },
      { href: '/research', label: 'Research', icon: Search },
      { href: '/position-review', label: 'Position Review', icon: ClipboardList },
    ],
    matchPaths: ['/watchlist', '/research', '/position-review'],
  },
  {
    label: 'Admin',
    icon: FolderOpen,
    items: [
      { href: '/documents', label: 'Documents', icon: FolderOpen },
      { href: '/financials', label: 'Financials', icon: DollarSign },
      { href: '/legal', label: 'Legal', icon: Scale },
    ],
    matchPaths: ['/documents', '/financials', '/legal'],
  },
];

function NavDropdown({ group, pathname, searchParams }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timeoutRef = useRef(null);

  const currentFullPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');

  const isGroupActive = group.matchPaths.some(
    p => pathname === p || pathname.startsWith(p + '/')
  );

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const Icon = group.icon;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className={`
          flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200
          ${isGroupActive
            ? 'text-emerald-700 bg-emerald-50'
            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          }
        `}
      >
        <Icon size={15} />
        {group.label}
        <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        {isGroupActive && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-emerald-500 rounded-full" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-xl shadow-lg shadow-gray-200/80 border border-gray-100 py-1.5 z-50">
          {group.items.map(({ href, label, icon: ItemIcon }) => {
            const isItemActive = href.includes('?')
              ? currentFullPath === href
              : currentFullPath === href;

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`
                  flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium no-underline transition-all duration-150
                  ${isItemActive
                    ? 'text-emerald-700 bg-emerald-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }
                `}
              >
                <ItemIcon size={15} className={isItemActive ? 'text-emerald-600' : 'text-gray-400'} />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled
        ? 'bg-white/80 backdrop-blur-md shadow-md'
        : 'bg-white/60 backdrop-blur-sm'
    }`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 no-underline group">
          <Image
            src="/images/logo.png"
            alt="B.D. Sterling Capital"
            width={160}
            height={44}
            className="h-9 w-auto object-contain"
            priority
          />
          <span className="text-gray-400 text-sm font-medium">|</span>
          <span className="text-gray-700 font-semibold text-sm tracking-tight group-hover:text-emerald-700 transition-colors">
            Research Management System
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_GROUPS.map(group => (
            <NavDropdown key={group.label} group={group} pathname={pathname} searchParams={searchParams} />
          ))}

          <button
            onClick={() => {
              logout();
              window.location.href = '/login';
            }}
            className="ml-4 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all duration-200"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
