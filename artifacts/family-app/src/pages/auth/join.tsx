import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { apiGetInvite, apiJoin } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type InviteInfo = {
  householdName: string;
  inviterName: string;
  email: string;
};

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? '';
  const [, navigate] = useLocation();
  const { refetch } = useAuth();

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(true);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteError('No invite token provided.');
      setInviteLoading(false);
      return;
    }
    apiGetInvite(token)
      .then(info => {
        setInviteInfo(info);
        setEmail(info.email ?? '');
      })
      .catch(() => {
        setInviteError('This invite link is invalid or has expired.');
      })
      .finally(() => setInviteLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);
    try {
      await apiJoin(token, { displayName, email, password });
      await refetch();
      navigate('/');
    } catch (err: any) {
      setFormError(err.message ?? 'Failed to join household');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (inviteLoading) {
    return (
      <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#4A7C59] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center p-4">
        <div className="w-full max-w-sm mx-auto text-center">
          <p className="text-red-600 mb-4">{inviteError}</p>
          <a
            href="#"
            onClick={e => { e.preventDefault(); navigate('/register'); }}
            className="text-sm text-[#4A7C59] hover:underline"
          >
            ← Create your own household
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        <button
          onClick={() => navigate('/register')}
          className="text-sm text-[#4A7C59] hover:underline mb-6 inline-block"
        >
          ← Create your own household
        </button>

        <div className="mb-8">
          <h1 className="font-serif text-3xl font-semibold text-[#1a1a1a]">You're invited!</h1>
          {inviteInfo && (
            <p className="text-sm text-muted-foreground mt-2">
              <span className="font-medium text-foreground">{inviteInfo.inviterName}</span> has invited you to join{' '}
              <span className="font-medium text-foreground">{inviteInfo.householdName}</span> on Lighthouse.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-border rounded-md bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 focus:border-[#4A7C59]"
            />
          </div>

          {formError && <p className="text-red-600 text-sm">{formError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#4A7C59] hover:bg-[#3d6b4c] text-white font-medium py-2.5 rounded-md transition-colors disabled:opacity-60"
          >
            {isSubmitting ? 'Joining…' : 'Join household'}
          </button>
        </form>
      </div>
    </div>
  );
}
