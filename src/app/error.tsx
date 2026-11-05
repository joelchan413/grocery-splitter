'use client';

import { useEffect } from 'react';

// A failed deferred chunk should offer recovery instead of the generic crash
// page. Reload also retries a rejected React.lazy import after reconnecting.
export default function AppError({ error }: { error: unknown }) {
  useEffect(() => { console.error('GrocerySplit runtime error:', error); }, [error]);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div role="alert" className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-slate-900">GrocerySplit couldn’t finish loading</h1>
        <p className="mt-3 text-sm text-slate-600">Check your connection, then reload to try again.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 cursor-pointer rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
        >
          Reload app
        </button>
      </div>
    </main>
  );
}
