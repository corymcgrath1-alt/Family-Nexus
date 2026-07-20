import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { apiLogin } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { refetch } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await apiLogin(email, password);
      await refetch();
      navigate('/');
    } catch (err: any) {
      setError(err.message ?? 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        {/* Lighthouse icon */}
        <div className="flex flex-col items-center mb-8">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Tower base */}
            <rect x="24" y="38" width="16" height="20" rx="2" fill="#4A7C59" />
            {/* Tower middle */}
            <rect x="22" y="22" width="20" height="18" rx="1" fill="#4A7C59" />
            {/* Tower top / light housing */}
            <rect x="20" y="14" width="24" height="10" rx="2" fill="#4A7C59" />
            {/* Light */}
            <circle cx="32" cy="19" r="4" fill="#F8F6F1" opacity="0.9" />
            {/* Light rays */}
            <line x1="32" y1="6" x2="32" y2="2" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
            <line x1="42" y1="10" x2="45" y2="7" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
            <line x1="46" y1="19" x2="50" y2="19" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
            <line x1="22" y1="10" x2="19" y2="7" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
            <line x1="18" y1="19" x2="14" y2="19" stroke="#4A7C59" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <h1 className="font-serif text-3xl font-semibold text-[#1a1a1a] mt-4">Lighthouse</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-8 text-center">Your family's shared operating system</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 focus:border-[#4A7C59]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 focus:border-[#4A7C59]"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#4A7C59] hover:bg-[#3d6b4c] text-white font-medium py-2.5 rounded-md transition-colors disabled:opacity-60"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Demo credentials */}
        <div className="mt-4 border border-stone-200 rounded-lg p-3 bg-stone-50">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Demo:</span> alex@example.com or morgan@example.com / lighthouse123
          </p>
        </div>

        <div className="mt-4 text-center">
          <a
            href="#"
            onClick={e => { e.preventDefault(); navigate('/register'); }}
            className="text-sm text-[#4A7C59] hover:underline"
          >
            New household? Create one →
          </a>
        </div>
      </div>
    </div>
  );
}
