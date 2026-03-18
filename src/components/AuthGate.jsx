'use client';

import { useAuth } from '@/lib/AuthContext';
import { useEffect } from 'react';

export default function AuthGate({ children }) {
  const { authenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && !authenticated) {
      window.location.href = '/login';
    }
  }, [authenticated, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Redirecting to login...</p>
      </div>
    );
  }

  return children;
}
