'use client'

import { useEffect, useMemo, useState } from 'react'

type TableType = 'Snooker' | 'Pool' | 'PS5'
type Session = {
  id: string
  tableId: string
  tableName: string
  type: TableType
  startedAt: number
  endedAt?: number
  amount: number
}
type Table = {
  id: string
  name: string
  type: TableType
  rate: number // per hour
}

const TABLES: Table[] = [
  { id: 'snooker-1', name: 'Snooker 1', type: 'Snooker', rate: 240 },
  { id: 'snooker-2', name: 'Snooker 2', type: 'Snooker', rate: 240 },
  { id: 'pool-1', name: 'Pool 1', type: 'Pool', rate: 180 },
  { id: 'ps5-1', name: 'PS5-1', type: 'PS5', rate: 300 },
]

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
function formatMoney(amount: number) {
  return `₹${amount}`
}
function today(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

export default function App() {
  const [running, setRunning] = useState<Session[]>([])
  const [history, setHistory] = useState<Session[]>([])
  const [tick, setTick] = useState(Date.now())

  // Dummy: hydrate with 1 running and 1 history
  useEffect(() => {
    if (running.length === 0 && history.length === 0) {
      setRunning([
        {
          id: 's1',
          tableId: 'snooker-1',
          tableName: 'Snooker 1',
          type: 'Snooker',
          startedAt: Date.now() - 1000 * 60 * 17,
          amount: 0,
        },
      ])
      setHistory([
        {
          id: 'h1',
          tableId: 'pool-1',
          tableName: 'Pool 1',
          type: 'Pool',
          startedAt: Date.now() - 1000 * 60 * 90,
          endedAt: Date.now() - 1000 * 60 * 60,
          amount: 120,
        },
      ])
    }
    const timer = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Calculate bill for running sessions
  const runningWithBill = running.map((s) => {
    const table = TABLES.find((t) => t.id === s.tableId)
    const ms = tick - s.startedAt
    const rate = table?.rate ?? 0
    const amount = Math.ceil((ms / 1000 / 60 / 60) * rate)
    return { ...s, amount }
  })

  // Table status
  const runningIds = new Set(running.map((s) => s.tableId))
  const availableTables = TABLES.filter((t) => !runningIds.has(t.id))

  // Summary
  const todayHistory = history.filter((h) => h.endedAt && today(h.endedAt))
  const todayEarnings = todayHistory.reduce((sum, s) => sum + s.amount, 0)

  // Actions
  function startSession(table: Table) {
    setRunning((prev) => [
      ...prev,
      {
        id: 's' + Math.random().toString(36).slice(2),
        tableId: table.id,
        tableName: table.name,
        type: table.type,
        startedAt: Date.now(),
        amount: 0,
      },
    ])
  }
  function endSession(session: Session) {
    setRunning((prev) => prev.filter((s) => s.id !== session.id))
    setHistory((prev) => [
      {
        ...session,
        endedAt: Date.now(),
      },
      ...prev,
    ])
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col items-center w-full">
      {/* Running Sessions */}
      <div className="w-full max-w-sm flex flex-col gap-4 mt-4">
        {runningWithBill.length === 0 && (
          <div className="text-center text-zinc-500 text-lg py-8">No games running</div>
        )}
        {runningWithBill.map((s) => (
          <div key={s.id} className="flex flex-col items-center bg-zinc-900 rounded-2xl px-4 py-6 shadow border-l-8 border-red-600">
            <div className="flex w-full items-center justify-between mb-2">
              <span className="font-bold text-lg text-white">{s.tableName}</span>
              <span className="text-xs font-bold text-red-500 animate-pulse">LIVE</span>
            </div>
            <div className="text-5xl font-mono font-bold text-white tracking-tight mb-2">
              {formatTime(tick - s.startedAt)}
            </div>
            <div className="text-yellow-400 text-2xl font-extrabold mb-4">{formatMoney(s.amount)}</div>
            <button
              className="w-full bg-red-600 hover:bg-red-700 text-white text-xl font-bold py-3 rounded-xl mt-2 active:scale-95 transition"
              onClick={() => endSession(s)}
            >
              END GAME
            </button>
          </div>
        ))}
      </div>

      {/* Available Tables */}
      <div className="w-full max-w-sm flex flex-col gap-4 mt-8">
        {availableTables.map((t) => (
          <div key={t.id} className="flex flex-col items-center bg-zinc-900 rounded-2xl px-4 py-6 shadow border-l-8 border-green-600">
            <span className="font-bold text-lg text-white mb-4">{t.name}</span>
            <button
              className="w-full bg-green-600 hover:bg-green-700 text-white text-xl font-bold py-3 rounded-xl active:scale-95 transition"
              onClick={() => startSession(t)}
            >
              START
            </button>
          </div>
        ))}
      </div>

      {/* Summary Strip */}
      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-2 pointer-events-none z-10">
        <div className="bg-zinc-900/90 rounded-full px-6 py-2 flex gap-6 items-center text-sm shadow pointer-events-auto border border-zinc-800">
          <span className="text-yellow-400 font-bold">{formatMoney(todayEarnings)}</span>
          <span className="text-green-400 font-bold">{runningWithBill.length} Active</span>
        </div>
      </div>

      {/* History */}
      <div className="w-full max-w-sm flex flex-col gap-2 mt-8 mb-24">
        <div className="text-zinc-400 text-sm font-bold mb-2">History</div>
        {history.length === 0 && <div className="text-zinc-600 text-center">No history yet</div>}
        {history.map((h) => (
          <div key={h.id} className="flex flex-col bg-zinc-900 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">{h.tableName}</span>
              <span className="text-zinc-400 text-xs font-mono">
                {h.startedAt && new Date(h.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' - '}
                {h.endedAt && new Date(h.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="text-yellow-400 font-bold text-lg mt-1">{formatMoney(h.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}