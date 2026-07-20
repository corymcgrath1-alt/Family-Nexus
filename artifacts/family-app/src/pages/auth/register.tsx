import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { apiRegister } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { refetch } = useAuth();
  const [householdName, setHouseholdName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setIsLoading(true);
    try {
      await apiRegister({ householdName, displayName, email, password });
      await refetch();
      navigate('/');
    } catch (err: any) {
      setError(err.message ?? 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        <button
          onClick={() => navigate('/login')}
          className="text-sm text-[#4A7C59] hover:underline mb-6 inline-block"
        >
          ← Sign in
        </button>

        <div className="mb-8">
          <h1 className="font-serif text-3xl font-semibold text-[#1a1a1a]">Create your Lighthouse</h1>
          <p className="text-sm text-muted-foreground mt-1">Set up a private space for your household.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="householdName">
              Household name
            </label>
            <input
              id="householdName"
              type="text"
              value={householdName}
              onChange={e => setHouseholdName(e.target.value)}
              required
              placeholder="The Johnson Family"
              className="w-full px-3 py-2 border border-border rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 focus:border-[#4A7C59]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="displayName">
              Your name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              placeholder="Alex"
              className="w-full px-3 py-2 border border-border rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 focus:border-[#4A7C59]"
            />
          </div>
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
              placeholder="you@example.com"
              className="w-full px-3 py-2 border border-border rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 focus:border-[#4A7C59]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="password">
              Password <span className="text-muted-foreground font-normal">(min 8 chars)</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-border rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 focus:border-[#4A7C59]"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#4A7C59] hover:bg-[#3d6b4c] text-white font-medium py-2.5 rounded-md transition-colors disabled:opacity-60"
          >
            {isLoading ? 'Creating…' : 'Create household'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <a
            href="#"
            onClick={e => { e.preventDefault(); navigate('/join'); }}
            className="text-sm text-[#4A7C59] hover:underline"
          >
            Have an invite link? Join here →
          </a>
        </div>
      </div>
    </div>
  );
}
