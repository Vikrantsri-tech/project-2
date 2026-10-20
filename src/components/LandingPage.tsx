import { useState } from 'react';
import { Code2, Plus, ArrowRight, Loader2, LogOut, Copy, Check, Users, Zap, MessageSquare, Play } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { LANGUAGES, getLanguage } from '@/lib/languages';
import type { Room } from '@/lib/types';

interface LandingPageProps {
  onEnterRoom: (room: Room) => void;
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export default function LandingPage({ onEnterRoom }: LandingPageProps) {
  const { user, signOut } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [language, setLanguage] = useState('cpp');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);

  const displayName = (user?.user_metadata as { display_name?: string })?.display_name ?? user?.email ?? 'Coder';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const roomId = generateRoomId();
    const lang = getLanguage(language);
    const { data, error: insertError } = await supabase
      .from('rooms')
      .insert({
        room_id: roomId,
        name: roomName || 'Untitled Room',
        language,
        code: lang.boilerplate,
        members: [user?.id],
        owner_id: user?.id,
      })
      .select()
      .single();

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCreatedRoom(data as Room);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinId.trim()) return;
    setBusy(true);
    setError(null);
    const code = joinId.trim().toUpperCase();

    const { data: room, error: fetchError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_id', code)
      .maybeSingle();

    if (fetchError) {
      setBusy(false);
      setError(fetchError.message);
      return;
    }
    if (!room) {
      setBusy(false);
      setError(`Room "${code}" not found. Check the ID and try again.`);
      return;
    }

    // Add user to members if not already
    const members = room.members || [];
    if (user?.id && !members.includes(user.id)) {
      await supabase.from('rooms').update({ members: [...members, user.id] }).eq('room_id', code);
    }

    setBusy(false);
    onEnterRoom(room as Room);
  }

  function copyRoomId() {
    if (!createdRoom) return;
    navigator.clipboard.writeText(createdRoom.room_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/8 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/8 rounded-full blur-3xl" />

      {/* Header */}
      <header className="relative border-b border-gray-800/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold">CodeTogether</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-xs font-bold text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline">{displayName}</span>
            </div>
            <button
              onClick={signOut}
              className="text-gray-400 hover:text-gray-200 transition-colors p-2 rounded-lg hover:bg-gray-800"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Code together,
            <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent"> in real time</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Create a room, share the ID with your friends, and start coding together.
            Real-time sync, chat, and code execution — all in one place.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          {[
            { icon: Zap, title: 'Real-time Sync', desc: 'See changes instantly' },
            { icon: MessageSquare, title: 'Built-in Chat', desc: 'Talk while you code' },
            { icon: Play, title: 'Run Code', desc: '13 languages supported' },
            { icon: Users, title: 'Collaborative', desc: 'Multiple coders per room' },
          ].map((f) => (
            <div key={f.title} className="bg-[#161b22] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
                <f.icon className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="font-medium text-sm mb-1">{f.title}</h3>
              <p className="text-xs text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Join room */}
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="font-semibold">Join a Room</h2>
                <p className="text-xs text-gray-500">Enter a room ID to start coding</p>
              </div>
            </div>
            <form onSubmit={handleJoin} className="space-y-3">
              <input
                type="text"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                placeholder="e.g. A7X92K"
                maxLength={6}
                className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3 text-lg font-mono tracking-widest text-center text-gray-100 placeholder-gray-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-colors uppercase"
              />
              {error && !showCreate && (
                <p className="text-sm text-red-400">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy || !joinId.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Join Room
              </button>
            </form>
          </div>

          {/* Create room */}
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Plus className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="font-semibold">Create a Room</h2>
                <p className="text-xs text-gray-500">Start a new coding session</p>
              </div>
            </div>

            {createdRoom ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Your Room ID</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3 text-2xl font-mono font-bold tracking-widest text-center text-emerald-400">
                      {createdRoom.room_id}
                    </div>
                    <button
                      onClick={copyRoomId}
                      className="p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                      title="Copy room ID"
                    >
                      {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-gray-300" />}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-400">
                  Share this ID with your friends so they can join the room.
                </p>
                <button
                  onClick={() => onEnterRoom(createdRoom)}
                  className="w-full bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  Enter Room
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-3">
                {!showCreate ? (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Room
                  </button>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Room Name</label>
                      <input
                        type="text"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        placeholder="My Coding Session"
                        className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Language</label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {error && showCreate && (
                      <p className="text-sm text-red-400">{error}</p>
                    )}
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Create Room
                    </button>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
