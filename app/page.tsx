"use client";

import React, { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { ShieldAlert, LogOut, LayoutDashboard, History, Play, Square, Users, Clock, ShoppingCart, Plus, Minus, Trash2, Wallet, CreditCard, ChevronLeft } from 'lucide-react';

const UNITS = [
  { id: 's1', name: 'Snooker Table 1', type: 'Snooker', rateStr: '₹240/hr' },
  { id: 's2', name: 'Snooker Table 2', type: 'Snooker', rateStr: '₹240/hr' },
  { id: 'p1', name: 'Pool Table 1', type: 'Pool', rateStr: '₹180/hr' },
  { id: 'ps1', name: 'PS5 - 1', type: 'PS5', rateStr: '₹150/hr' },
  { id: 'ps2', name: 'PS5 - 2', type: 'PS5', rateStr: '₹150/hr' },
];

const INITIAL_ITEMS = [
  { id: 'c15', name: 'Cigarette (Choti)', price: 15 },
  { id: 'c25', name: 'Cigarette (Regular)', price: 25 },
  { id: 'm80', name: 'Maggie', price: 80 },
  { id: 's100', name: 'Sandwich', price: 100 },
  { id: 't20', name: 'Tea', price: 20 },
  { id: 'c30', name: 'Coffee', price: 30 },
  { id: 'o60', name: 'Omelette', price: 60 },
  { id: 'ls30', name: 'Lemon Soda', price: 30 },
  { id: 'cc100', name: 'Cold Coffee', price: 100 },
];

function getRatePerMinute(unitType: string, peopleCount: number) {
  if (unitType === 'Snooker') {
    if (peopleCount <= 2) return 4;
    if (peopleCount === 3) return 4.66;
    return 5;
  }
  if (unitType === 'Pool') {
    if (peopleCount <= 2) return 3;
    if (peopleCount === 3) return 3.33;
    return 3.66;
  }
  if (unitType === 'PS5') {
    return 2.5; // 150/hr
  }
  return 0;
}

function generateSegments(unitType: string, sessionId: string, blocks: any[], endBoundary: number) {
  const segments: any[] = [];

  for (const block of blocks) {
    const blockStart = block.startTime;
    const blockEnd = block.endTime || endBoundary;
    const people = block.peopleCount;
    const rate = getRatePerMinute(unitType, people);

    const startDate = new Date(blockStart);
    const hhStart = new Date(startDate); hhStart.setHours(13, 0, 0, 0);
    const hhEnd = new Date(startDate); hhEnd.setHours(15, 0, 0, 0);

    const start = blockStart;
    const end = blockEnd;

    if (end <= hhStart.getTime() || start >= hhEnd.getTime()) {
      segments.push({
        id: `${sessionId}-${start}-normal`,
        sessionId,
        startTime: start,
        endTime: end,
        peopleCount: people,
        ratePerMinute: rate,
        isHappyHour: false
      });
    } else {
      if (start < hhStart.getTime()) {
        segments.push({
          id: `${sessionId}-${start}-prehh`,
          sessionId,
          startTime: start,
          endTime: hhStart.getTime(),
          peopleCount: people,
          ratePerMinute: rate,
          isHappyHour: false
        });
      }

      const overlapStart = Math.max(start, hhStart.getTime());
      const overlapEnd = Math.min(end, hhEnd.getTime());

      segments.push({
        id: `${sessionId}-${overlapStart}-hh`,
        sessionId,
        startTime: overlapStart,
        endTime: overlapEnd,
        peopleCount: people,
        ratePerMinute: rate,
        isHappyHour: true
      });

      if (end > hhEnd.getTime()) {
        segments.push({
          id: `${sessionId}-${hhEnd.getTime()}-posthh`,
          sessionId,
          startTime: hhEnd.getTime(),
          endTime: end,
          peopleCount: people,
          ratePerMinute: rate,
          isHappyHour: false
        });
      }
    }
  }

  return segments.filter(seg => seg.endTime > seg.startTime);
}

function calculateGameCost(segments: any[]) {
  return segments.reduce((total, seg) => {
    const minutes = (seg.endTime - seg.startTime) / 60000;
    const cost = minutes * seg.ratePerMinute;
    return total + (seg.isHappyHour ? cost * 0.5 : cost);
  }, 0);
}

function calculateItemsCost(itemsObj: Record<string, number>, allItems: any[]) {
  return Object.entries(itemsObj).reduce((total, [itemId, qty]) => {
    const item = allItems.find(i => i.id === itemId);
    return total + (item ? item.price * qty : 0);
  }, 0);
}

function formatDuration(startMs: number, endMs: number) {
  const seconds = (endMs - startMs) / 1000;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const formatTimeRange = (start: number, end: number) => {
  const s = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const e = new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${s} - ${e}`;
}

// Constants for staging/dev bypass
const DEV_MOCK_BUSINESS = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'HQ Lounge (Staging)',
};

const isDevelopment = () => {
  if (typeof window === 'undefined') return false;
  return (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('staging')
  );
};

export default function LoungeManager() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'live' | 'summary'>('live');
  const [now, setNow] = useState(Date.now());
  const [isMounted, setIsMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [business, setBusiness] = useState<any>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        router.push('/login');
      } else {
        setUser(firebaseUser);

        // Verify business ownership via phone number
        const phone = firebaseUser.phoneNumber;
        if (phone) {
          try {
            // Exact phone number matching from Firebase (E.164)
            const { data, error } = await supabase
              .from('users')
              .select('*, businesses(*)')
              .eq('phone', phone)
              .single();

            if (data && data.businesses) {
              setBusiness(data.businesses);
            } else if (isDevelopment()) {
              // Safety fallback for Localhost/Staging
              console.warn("User authenticated but not found in Supabase. Applying development mock business.");
              setBusiness(DEV_MOCK_BUSINESS);
            }
          } catch (err) {
            console.error("Auth verification error:", err);
            if (isDevelopment()) {
              setBusiness(DEV_MOCK_BUSINESS);
            }
          }
        }
        setIsAuthorizing(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const [items, setItems] = useState<any[]>(INITIAL_ITEMS);
  const [sessions, setSessions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  const [addingItemsFor, setAddingItemsFor] = useState<string | null>(null);
  const [endingSessionFor, setEndingSessionFor] = useState<string | null>(null);

  // Custom Item State
  const [isAddingCustomItem, setIsAddingCustomItem] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');

  useEffect(() => {
    const s = localStorage.getItem('snooker_sessions');
    const h = localStorage.getItem('snooker_history');
    const i = localStorage.getItem('snooker_items');
    if (s) setSessions(JSON.parse(s));
    if (h) setHistory(JSON.parse(h));
    if (i) setItems(JSON.parse(i));
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('snooker_sessions', JSON.stringify(sessions));
      localStorage.setItem('snooker_history', JSON.stringify(history));
      localStorage.setItem('snooker_items', JSON.stringify(items));
    }
  }, [sessions, history, items, isMounted]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!isMounted || !user || isAuthorizing) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-zinc-500 text-sm animate-pulse">Loading Workspace...</p>
      </div>
    );
  }

  // Unauthorized State
  if (!business) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Access Not Approved</h1>
        <p className="text-zinc-500 text-sm max-w-xs mb-8">
          Your phone number is authenticated but not registered to any business. Please contact the administrator for access.
        </p>
        <button
          onClick={() => signOut(auth)}
          className="bg-zinc-900 hover:bg-zinc-800 text-white px-8 py-4 rounded-xl font-bold transition-all border border-zinc-800"
        >
          Logout & Try Again
        </button>
      </div>
    );
  }

  const startSession = (unitId: string) => {
    setSessions([...sessions, {
      id: Math.random().toString(36).substring(7),
      unitId,
      items: {},
      blocks: [{ startTime: Date.now(), endTime: null, peopleCount: 2 }]
    }]);
  };

  const addPerson = (sessionId: string) => {
    setSessions(sessions.map(s => {
      if (s.id === sessionId) {
        const timeNow = Date.now();
        const lastBlock = s.blocks[s.blocks.length - 1];
        if (lastBlock.peopleCount >= 4) return s; // Limit to 4 people
        const newBlocks = [...s.blocks];
        newBlocks[newBlocks.length - 1] = { ...lastBlock, endTime: timeNow };
        newBlocks.push({ startTime: timeNow, endTime: null, peopleCount: lastBlock.peopleCount + 1 });
        return { ...s, blocks: newBlocks };
      }
      return s;
    }));
  };

  const removePerson = (sessionId: string) => {
    setSessions(sessions.map(s => {
      if (s.id === sessionId) {
        const timeNow = Date.now();
        const lastBlock = s.blocks[s.blocks.length - 1];
        if (lastBlock.peopleCount <= 1) return s;
        const newBlocks = [...s.blocks];
        newBlocks[newBlocks.length - 1] = { ...lastBlock, endTime: timeNow };
        newBlocks.push({ startTime: timeNow, endTime: null, peopleCount: lastBlock.peopleCount - 1 });
        return { ...s, blocks: newBlocks };
      }
      return s;
    }));
  };

  const removeTwoPeople = (sessionId: string) => {
    setSessions(sessions.map(s => {
      if (s.id === sessionId) {
        const timeNow = Date.now();
        const lastBlock = s.blocks[s.blocks.length - 1];
        if (lastBlock.peopleCount <= 2) return s;
        const newBlocks = [...s.blocks];
        newBlocks[newBlocks.length - 1] = { ...lastBlock, endTime: timeNow };
        newBlocks.push({ startTime: timeNow, endTime: null, peopleCount: lastBlock.peopleCount - 2 });
        return { ...s, blocks: newBlocks };
      }
      return s;
    }));
  };

  const addItem = (sessionId: string, itemId: string) => {
    setSessions(sessions.map(s => {
      if (s.id === sessionId) {
        return { ...s, items: { ...s.items, [itemId]: (s.items[itemId] || 0) + 1 } };
      }
      return s;
    }));
  };

  const incrementItemQuantity = (sessionId: string, itemId: string) => {
    addItem(sessionId, itemId);
  };

  const decrementItemQuantity = (sessionId: string, itemId: string) => {
    setSessions(sessions.map(s => {
      if (s.id === sessionId) {
        const currentQty = s.items[itemId] || 0;
        const newItems = { ...s.items };
        if (currentQty <= 1) {
          delete newItems[itemId];
        } else {
          newItems[itemId] = currentQty - 1;
        }
        return { ...s, items: newItems };
      }
      return s;
    }));
  };

  const removeItem = (sessionId: string, itemId: string) => {
    setSessions(sessions.map(s => {
      if (s.id === sessionId) {
        const newItems = { ...s.items };
        delete newItems[itemId];
        return { ...s, items: newItems };
      }
      return s;
    }));
  };

  const endSession = (sessionId: string, paymentMethod: 'Cash' | 'UPI') => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const unit = UNITS.find(u => u.id === session.unitId)!;
    const endMs = Date.now();

    // Create final segments
    const finalSegments = generateSegments(unit.type, session.id, session.blocks, endMs);

    const gameCost = calculateGameCost(finalSegments);
    const itemsCost = calculateItemsCost(session.items, items);
    const firstStart = session.blocks[0].startTime;

    const historyRecord = {
      id: session.id,
      unitName: unit.name,
      startTime: firstStart,
      endTime: endMs,
      durationSec: (endMs - firstStart) / 1000,
      gameCost,
      itemsCost,
      grandTotal: gameCost + itemsCost,
      paymentMethod,
      items: session.items,
      segments: finalSegments
    };

    setHistory([historyRecord, ...history]);
    setSessions(sessions.filter(s => s.id !== sessionId));
    setEndingSessionFor(null);
  };

  const isCurrentlyHappyHour = new Date(now).getHours() >= 13 && new Date(now).getHours() < 15;

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-4 sticky top-0 z-10 flex justify-between items-center shadow-md">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{business?.name || 'HQ Lounge'}</h1>
          <p className="text-xs text-zinc-400">
            {isCurrentlyHappyHour ? (
              <span className="text-yellow-400 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                Happy Hour (50% Off Game)
              </span>
            ) : (
              "Standard Rates Apply"
            )}
          </p>
        </div>
        <button onClick={() => signOut(auth)} className="text-zinc-400 hover:text-white transition-colors p-2">
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {activeTab === 'live' ? (
          <div className="space-y-4">
            {/* Active Sessions */}
            {sessions.map(session => {
              const unit = UNITS.find(u => u.id === session.unitId)!;
              const currentBlock = session.blocks[session.blocks.length - 1];
              const segments = generateSegments(unit.type, session.id, session.blocks, now);
              const gameCost = calculateGameCost(segments);
              const itemsCost = calculateItemsCost(session.items, items);
              const totalCost = gameCost + itemsCost;
              const hasHH = segments.some(s => s.isHappyHour);

              return (
                <div key={session.id} className="bg-zinc-900 border border-red-500/30 rounded-2xl p-4 shadow-lg shadow-red-900/10">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></div>
                        <h2 className="text-lg font-semibold text-white">
                          {unit.name} <span className="text-xs text-zinc-500 font-normal ml-1">• {unit.rateStr}</span>
                        </h2>
                      </div>
                      <div className="flex items-center gap-3 text-zinc-400 text-sm font-mono">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatDuration(session.blocks[0].startTime, now)}</span>
                        <span className="flex items-center gap-1 text-blue-400 bg-blue-500/10 px-2 rounded-full"><Users className="w-3.5 h-3.5" /> {currentBlock.peopleCount}/4</span>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="text-2xl font-bold text-yellow-400 font-mono tracking-tight">
                        ₹{Math.round(totalCost)}
                      </div>
                      {hasHH && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider mt-1">HH Applied</span>}
                    </div>
                  </div>

                  {/* Items List */}
                  {Object.entries(session.items).length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-zinc-800 pt-3">
                      {Object.entries(session.items).map(([itemId, qty]) => {
                        const item = items.find(i => i.id === itemId);
                        if (!item) return null;
                        return (
                          <div key={itemId} className="flex items-center justify-between bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/30">
                            <div className="flex flex-col">
                              <span className="text-white text-xs font-medium">{item.name}</span>
                              <span className="text-yellow-400 text-[10px] font-mono">₹{item.price * (qty as number)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-800 p-1">
                                <button
                                  onClick={() => decrementItemQuantity(session.id, itemId)}
                                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-white text-xs font-bold w-6 text-center">{qty as number}</span>
                                <button
                                  onClick={() => incrementItemQuantity(session.id, itemId)}
                                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <button
                                onClick={() => removeItem(session.id, itemId)}
                                className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick Controls */}
                  <div className="space-y-2 mt-4">
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => currentBlock.peopleCount < 4 && addPerson(session.id)}
                        disabled={currentBlock.peopleCount >= 4}
                        className={`py-2.5 rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-1 transition-colors ${currentBlock.peopleCount >= 4
                          ? 'bg-zinc-800/50 text-zinc-600 border border-zinc-800/50'
                          : 'bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400'
                          }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        +1 Player
                      </button>
                      <button
                        onClick={() => currentBlock.peopleCount > 1 && removePerson(session.id)}
                        disabled={currentBlock.peopleCount <= 1}
                        className={`py-2.5 rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-1 transition-colors ${currentBlock.peopleCount <= 1
                          ? 'bg-zinc-800/50 text-zinc-600 border border-zinc-800/50'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                          }`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                        -1 Player
                      </button>
                      <button
                        onClick={() => currentBlock.peopleCount > 2 && removeTwoPeople(session.id)}
                        disabled={currentBlock.peopleCount <= 2}
                        className={`py-2.5 rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-1 transition-colors ${currentBlock.peopleCount <= 2
                          ? 'bg-zinc-800/50 text-zinc-600 border border-zinc-800/50'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                          }`}
                      >
                        <div className="flex">
                          <Minus className="w-3 h-3" />
                          <Minus className="w-3 h-3 -ml-1" />
                        </div>
                        -2 Players
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setAddingItemsFor(session.id)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        <ShoppingCart className="w-4 h-4 text-emerald-400" />
                        Items
                      </button>
                      <button
                        onClick={() => setEndingSessionFor(session.id)}
                        className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-500 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                      >
                        <Square className="w-4 h-4" fill="currentColor" />
                        END SESSION
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Available Units */}
            {UNITS.filter(u => !sessions.find(s => s.unitId === u.id)).map(unit => (
              <div key={unit.id} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium text-zinc-300">
                    {unit.name} <span className="text-xs text-zinc-500 font-normal ml-1">• {unit.rateStr}</span>
                  </h2>
                </div>
                <button
                  onClick={() => startSession(unit.id)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors"
                >
                  <Play className="w-5 h-5" fill="currentColor" />
                  START
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg">
              <h2 className="text-zinc-400 text-sm font-medium mb-4 flex items-center gap-2 uppercase tracking-wider">
                <LayoutDashboard className="w-4 h-4" /> Today's Summary
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800/50">
                  <p className="text-zinc-500 text-xs mb-1">Total Earnings</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    ₹{Math.round(history.reduce((sum, h) => sum + h.grandTotal, 0))}
                  </p>
                </div>
                <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800/50">
                  <p className="text-zinc-500 text-xs mb-1">Sessions</p>
                  <p className="text-2xl font-bold text-white">{history.length}</p>
                </div>
                <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800/50 flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg"><Wallet className="w-5 h-5 text-emerald-500" /></div>
                  <div>
                    <p className="text-zinc-500 text-[10px] uppercase">Cash</p>
                    <p className="font-bold text-white tracking-tight">₹{Math.round(history.filter(h => h.paymentMethod === 'Cash').reduce((sum, h) => sum + h.grandTotal, 0))}</p>
                  </div>
                </div>
                <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800/50 flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg"><CreditCard className="w-5 h-5 text-blue-500" /></div>
                  <div>
                    <p className="text-zinc-500 text-[10px] uppercase">UPI</p>
                    <p className="font-bold text-white tracking-tight">₹{Math.round(history.filter(h => h.paymentMethod === 'UPI').reduce((sum, h) => sum + h.grandTotal, 0))}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* History List */}
            <div>
              <h2 className="text-zinc-400 text-sm font-medium mb-3 flex items-center gap-2 uppercase tracking-wider">
                <History className="w-4 h-4" /> Completed Sessions
              </h2>
              <div className="space-y-3">
                {history.length === 0 && <p className="text-zinc-600 text-center py-6 text-sm">No completed sessions yet.</p>}
                {history.map(h => (
                  <div key={h.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
                    <div className="flex justify-between items-start">
                      <h3 className="font-medium text-white">{h.unitName}</h3>
                      <span className="text-yellow-400 font-mono font-bold">₹{Math.round(h.grandTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-zinc-500 font-mono">
                      <span>{formatDuration(h.startTime, h.endTime)}</span>
                      <span className={`px-2 py-0.5 rounded-full font-sans text-[10px] font-bold uppercase tracking-wider ${h.paymentMethod === 'UPI' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {h.paymentMethod}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="bg-zinc-900 border-t border-zinc-800 fixed bottom-0 w-full max-w-md flex pb-safe">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'live' ? 'text-white' : 'text-zinc-500 hover:text-zinc-400'}`}
        >
          <Play className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-widest">Live</span>
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'summary' ? 'text-white' : 'text-zinc-500 hover:text-zinc-400'}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-widest">Summary</span>
        </button>
      </div>

      {/* Add Items Drawer */}
      {addingItemsFor && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col justify-end backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 rounded-t-3xl border-t border-zinc-800 p-6 pb-12 animate-in slide-in-from-bottom-10 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-xl font-bold text-white">Add Items</h3>
              <button onClick={() => { setAddingItemsFor(null); setIsAddingCustomItem(false); }} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white">
                <ChevronLeft className="w-5 h-5 -rotate-90" />
              </button>
            </div>

            <div className="overflow-y-auto pr-1 flex-1 min-h-0">
              <div className="grid grid-cols-2 gap-3 pb-4">
                {items.map(item => {
                  const session = sessions.find(s => s.id === addingItemsFor);
                  const qty = session?.items[item.id] || 0;

                  return (
                    <button
                      key={item.id}
                      onClick={() => addItem(addingItemsFor, item.id)}
                      className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex flex-col items-center text-center gap-2 relative active:scale-95 transition-transform"
                    >
                      {qty > 0 && (
                        <span className="absolute -top-2 -right-2 bg-blue-500 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold shadow-md">
                          {qty as number}
                        </span>
                      )}
                      <span className="text-white font-medium text-sm leading-tight">{item.name}</span>
                      <span className="text-yellow-400 text-xs font-mono">₹{item.price}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="shrink-0 pt-4 border-t border-zinc-800 mt-2">
              {!isAddingCustomItem ? (
                <button
                  onClick={() => setIsAddingCustomItem(true)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors mb-3"
                >
                  <Plus className="w-4 h-4" /> Add Custom Item
                </button>
              ) : (
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 mb-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Item Name"
                      value={customItemName}
                      onChange={e => setCustomItemName(e.target.value)}
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      autoFocus
                    />
                    <input
                      type="number"
                      placeholder="Price"
                      value={customItemPrice}
                      onChange={e => setCustomItemPrice(e.target.value)}
                      className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!customItemName || !customItemPrice) return;
                        const newItem = { id: 'custom_' + Date.now(), name: customItemName, price: Number(customItemPrice) };
                        setItems([...items, newItem]);
                        addItem(addingItemsFor, newItem.id);
                        setCustomItemName('');
                        setCustomItemPrice('');
                        setIsAddingCustomItem(false);
                      }}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold py-2.5 rounded-lg text-sm transition-colors"
                    >
                      Add & Select
                    </button>
                    <button
                      onClick={() => { setIsAddingCustomItem(false); setCustomItemName(''); setCustomItemPrice(''); }}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => { setAddingItemsFor(null); setIsAddingCustomItem(false); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold transition-colors"
              >
                Done Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Session Drawer */}
      {endingSessionFor && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col justify-end backdrop-blur-sm animate-in fade-in overflow-hidden">
          <div className="bg-zinc-900 rounded-t-3xl border-t border-zinc-800 p-6 pb-12 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10">
            {(() => {
              const session = sessions.find(s => s.id === endingSessionFor);
              if (!session) return null;
              const unit = UNITS.find(u => u.id === session.unitId)!;

              const finalSegments = generateSegments(unit.type, session.id, session.blocks, now);
              const gameCost = calculateGameCost(finalSegments);
              const itemsCost = calculateItemsCost(session.items, items);
              const grandTotal = Math.round(gameCost + itemsCost);

              return (
                <>
                  <h3 className="text-center text-zinc-400 uppercase tracking-widest text-xs font-bold mb-2">Final Bill</h3>
                  <h2 className="text-center text-3xl font-bold text-white mb-6">{unit.name}</h2>

                  <div className="bg-zinc-950 rounded-2xl p-4 mb-6 space-y-3 font-mono text-xs border border-zinc-800/50">
                    <div className="text-zinc-500 uppercase tracking-wider mb-2 text-[10px]">Game Segments</div>

                    {finalSegments.map((seg) => {
                      const mins = (seg.endTime - seg.startTime) / 60000;
                      const cost = mins * seg.ratePerMinute * (seg.isHappyHour ? 0.5 : 1);
                      return (
                        <div key={seg.id} className="flex justify-between text-zinc-300">
                          <div className="flex flex-col">
                            <span>{formatTimeRange(seg.startTime, seg.endTime)}</span>
                            <span className="text-[10px] text-zinc-500">{seg.peopleCount}p @ ₹{seg.ratePerMinute}/m {seg.isHappyHour && <span className="text-yellow-500 ml-1">(-50% HH)</span>}</span>
                          </div>
                          <span className="text-white mt-0.5">₹{cost.toFixed(1)}</span>
                        </div>
                      )
                    })}

                    <div className="border-t border-zinc-800 my-2 pt-2 flex justify-between text-zinc-400 font-bold">
                      <span>Total Game</span>
                      <span className="text-white">₹{Math.round(gameCost)}</span>
                    </div>

                    {Object.entries(session.items).length > 0 && (
                      <>
                        <div className="border-t border-zinc-800 my-3"></div>
                        <div className="text-zinc-500 uppercase tracking-wider mb-2 text-[10px]">Items</div>
                        {Object.entries(session.items).map(([itemId, qty]) => {
                          const item = items.find(i => i.id === itemId)!;
                          return (
                            <div key={itemId} className="flex justify-between text-zinc-300">
                              <span>{qty as number}x {item?.name || 'Unknown Item'}</span>
                              <span className="text-white">₹{(item?.price || 0) * (qty as number)}</span>
                            </div>
                          )
                        })}
                        <div className="border-t border-zinc-800 my-2 pt-2 flex justify-between text-zinc-400 font-bold">
                          <span>Total Items</span>
                          <span className="text-white">₹{itemsCost}</span>
                        </div>
                      </>
                    )}

                    <div className="border-t border-zinc-700 mt-4 pt-3 flex justify-between items-center text-lg">
                      <span className="text-white font-sans font-bold tracking-widest">GRAND TOTAL</span>
                      <span className="text-yellow-400 font-bold text-xl">₹{grandTotal}</span>
                    </div>
                  </div>

                  <p className="text-center text-zinc-500 text-xs mb-4 uppercase tracking-widest">Select Payment Method to Lock</p>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => endSession(session.id, 'Cash')}
                      className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Wallet className="w-5 h-5" />
                      CASH
                    </button>
                    <button
                      onClick={() => endSession(session.id, 'UPI')}
                      className="bg-blue-500 hover:bg-blue-600 text-zinc-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <CreditCard className="w-5 h-5" />
                      UPI
                    </button>
                  </div>

                  <button
                    onClick={() => setEndingSessionFor(null)}
                    className="w-full mt-4 text-zinc-500 py-3 font-medium hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
