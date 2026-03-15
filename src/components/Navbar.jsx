'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Briefcase, Search } from 'lucide-react';

const navLinks = [
  { href: '/holdings', label: 'Our Holdings', icon: Briefcase },
  { href: '/research', label: 'Research', icon: Search },
];

export default function Navbar() {
  const pathname = usePathname();
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
            Research Tool
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`
                  relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold no-underline transition-all duration-200
                  ${isActive
                    ? 'text-emerald-700 bg-emerald-50'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }
                `}
              >
                <Icon size={16} />
                {label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-emerald-500 rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
