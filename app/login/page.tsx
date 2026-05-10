"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';

declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'PHONE_INPUT' | 'OTP_INPUT' | 'SUCCESS'>('PHONE_INPUT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // To hold the confirmation result object from firebase
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    // Setup recaptcha verifier on mount
    if (typeof window !== 'undefined' && !window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
    }
  }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;

    setLoading(true);
    setError(null);

    try {
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
      const appVerifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);

      setConfirmationResult(confirmation);
      setStep('OTP_INPUT');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !confirmationResult) return;

    setLoading(true);
    setError(null);

    try {
      await confirmationResult.confirm(otp);
      setStep('SUCCESS');
      router.push('/');
    } catch (err: any) {
      console.error(err);
      setError('Invalid OTP. Please try again.');
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

        <div id="recaptcha-container"></div>

        {step === 'PHONE_INPUT' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 uppercase tracking-widest mb-2 ml-1">Phone Number</label>
              <div className="flex bg-zinc-950 border border-zinc-800 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 rounded-xl overflow-hidden transition-all">
                <span className="pl-4 py-4 text-zinc-500 font-medium">+91</span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  required
                  className="w-full bg-transparent px-3 py-4 text-white placeholder:text-zinc-600 outline-none text-lg"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || phoneNumber.length < 10}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-bold text-lg py-4 rounded-xl transition-all active:scale-[0.98]"
            >
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 'OTP_INPUT' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 uppercase tracking-widest mb-2 ml-1">Verification Code</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="000000"
                required
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-4 text-white text-center tracking-widest placeholder:text-zinc-600 transition-all outline-none text-2xl font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-bold text-lg py-4 rounded-xl transition-all active:scale-[0.98]"
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('PHONE_INPUT'); setOtp(''); setError(null); }}
              className="w-full text-zinc-500 text-sm font-medium hover:text-white transition-colors"
            >
              Change Phone Number
            </button>
          </form>
        )}

        {step === 'SUCCESS' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Login Successful</h2>
            <p className="text-zinc-400 text-sm">Redirecting to dashboard...</p>
          </div>
        )}
      </div>
    </div>
  );
}
