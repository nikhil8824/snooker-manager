"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { ShieldAlert, User, Lock, Mail, Phone } from 'lucide-react';


export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(''); // Email or Phone
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    // Check for existing session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/');
      }
    };
    checkSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) return;

    setLoading(true);
    setError(null);

    try {
      // Determine if identifier is email or phone
      const isEmail = identifier.includes('@');
      let loginParams: any = { password };

      if (isEmail) {
        loginParams.email = identifier;
      } else {
        // Simple phone formatting: if it doesn't start with +, assume +91
        const formattedPhone = identifier.startsWith('+') ? identifier : `+91${identifier.replace(/[^0-9]/g, '')}`;
        loginParams.phone = formattedPhone;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword(loginParams);

      if (authError) throw authError;

      if (data.user) {
        // Double check authorization in public.users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('id', data.user.id)
          .single();
        
        if (userData) {
          router.push('/');
        } else {
          setIsAuthorized(false);
          // Optionally sign out if not authorized
          await supabase.auth.signOut();
        }
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white font-sans">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-2 tracking-tight">HQ Lounge</h1>
        <p className="text-zinc-500 text-center text-sm mb-8 uppercase tracking-widest font-medium">Partner Login</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 uppercase tracking-widest mb-2 ml-1">Phone or Email</label>
            <div className="flex bg-zinc-950 border border-zinc-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 rounded-xl overflow-hidden transition-all items-center px-4">
              {identifier.includes('@') ? (
                <Mail className="w-5 h-5 text-zinc-500 mr-2" />
              ) : (
                <Phone className="w-5 h-5 text-zinc-500 mr-2" />
              )}
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Email or Phone number"
                required
                className="w-full bg-transparent py-4 text-white placeholder:text-zinc-600 outline-none text-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 uppercase tracking-widest mb-2 ml-1">Password</label>
            <div className="flex bg-zinc-950 border border-zinc-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 rounded-xl overflow-hidden transition-all items-center px-4">
              <Lock className="w-5 h-5 text-zinc-500 mr-2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-transparent py-4 text-white placeholder:text-zinc-600 outline-none text-lg"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !identifier || !password}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-bold text-lg py-4 rounded-xl transition-all active:scale-[0.98] mt-4"
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>

        {isAuthorized === false && (
          <div className="mt-8 pt-8 border-t border-zinc-800 text-center animate-in fade-in slide-in-from-top-2">
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Access Not Approved</h2>
            <p className="text-zinc-500 text-xs px-4">
              Your account is authenticated but not registered to any business.
            </p>
          </div>
        )}
      </div>
      
      <p className="mt-8 text-zinc-600 text-xs text-center max-w-xs">
        Secure access for lounge partners only. Contact administrator for credentials.
      </p>
    </div>
  );
}
