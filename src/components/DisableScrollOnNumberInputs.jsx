'use client';

import { useEffect } from 'react';

export default function DisableScrollOnNumberInputs() {
  useEffect(() => {
    const handler = (e) => {
      if (e.target.type === 'number') {
        e.target.blur();
      }
    };
    document.addEventListener('wheel', handler, { passive: true });
    return () => document.removeEventListener('wheel', handler);
  }, []);

  return null;
}
