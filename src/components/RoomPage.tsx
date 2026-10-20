import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import {
  ArrowLeft, Copy, Check, Play, Loader2, Send, Users, MessageSquare,
  Code2, ListChecks, Terminal, Download, History, ChevronRight,
  Mic, MicOff, Radio,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { LANGUAGES, getLanguage } from '@/lib/languages';
import { PROBLEMS, type Problem } from '@/lib/problems';
import type { Message, RunResult } from '@/lib/types';
import { usePresence } from '@/hooks/usePresence';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import CursorOverlay from '@/components/CursorOverlay';

interface RoomPageProps {
  roomId: string;
  onLeave: () => void;
}

type Tab = 'problems' | 'chat' | 'people' | 'output' | 'history';

export default function RoomPage({ roomId, onLeave }: RoomPageProps) {
  const { user } = useAuth();
  const displayName = (user?.user_metadata as { display_name?: string })?.display_name ?? user?.email ?? 'Coder';

  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [stdin, setStdin] = useState('');
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<{ user_name: string; created_at: string }[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  const editorRef = useRef<Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0] | null>(null);
  const isRemoteUpdate = useRef(false);
  const lastSavedCode = useRef('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const { peers, myColor, updateCursor, setMicOn } = usePresence({ roomId, userId: user?.id, displayName });
  const { micOn, toggleMic, speakingPeers, permissionError } = useVoiceChat({ roomId, userId: user?.id, displayName, peers });

  // Load room data
  useEffect(() => {
    let cancelled = false;

    async function loadRoom() {
      const { data: room, error: fetchError } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_id', roomId)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      if (!room) {
        setError('Room not found.');
        setLoading(false);
        return;
      }
      if (cancelled) return;

      setLanguage(room.language);
      setCode(room.code);
      lastSavedCode.current = room.code;
      setRoomName(room.name);
      setParticipants(room.members || []);

      // Load messages
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (!cancelled && msgs) setMessages(msgs as Message[]);

      // Load code history
      const { data: hist } = await supabase
        .from('code_history')
        .select('user_name, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!cancelled && hist) setHistory(hist as { user_name: string; created_at: string }[]);

      setLoading(false);
    }

    loadRoom();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Realtime: code changes
  useEffect(() => {
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as { code?: string; language?: string; name?: string; members?: string[] };
          if (updated.code !== undefined && updated.code !== lastSavedCode.current) {
            isRemoteUpdate.current = true;
            setCode(updated.code);
            lastSavedCode.current = updated.code;
            if (editorRef.current) {
              editorRef.current.setValue(updated.code);
            }
          }
          if (updated.language) setLanguage(updated.language);
          if (updated.name) setRoomName(updated.name);
          if (updated.members) setParticipants(updated.members);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => [...prev, msg]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'code_history', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const entry = payload.new as { user_name: string; created_at: string };
          setHistory((prev) => [entry, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Debounced save + history
  const saveCode = useCallback(
    (newCode: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (newCode === lastSavedCode.current) return;
        lastSavedCode.current = newCode;
        await supabase.from('rooms').update({ code: newCode }).eq('room_id', roomId);
        await supabase.from('code_history').insert({
          room_id: roomId,
          user_id: user?.id,
          user_name: displayName,
          code: newCode,
        });
      }, 800);
    },
    [roomId, user?.id, displayName]
  );

  function handleEditorChange(value: string | undefined) {
    const newCode = value ?? '';
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    setCode(newCode);
    saveCode(newCode);
  }

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e) => {
      updateCursor({ lineNumber: e.position.lineNumber, column: e.position.column });
    });
    // Decorations for remote selections
    monaco.editor.defineTheme('codetogether-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {},
    });
  };

  async function handleToggleMic() {
    await toggleMic();
    setMicOn(!micOn);
  }

  async function handleLanguageChange(newLang: string) {
    setLanguage(newLang);
    const lang = getLanguage(newLang);
    const newCode = lang.boilerplate;
    setCode(newCode);
    lastSavedCode.current = newCode;
    if (editorRef.current) editorRef.current.setValue(newCode);
    await supabase.from('rooms').update({ language: newLang, code: newCode }).eq('room_id', roomId);
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: user?.id,
      sender_name: displayName,
      message: msg,
    });
  }

  async function handleRunCode() {
    setRunning(true);
    setRunResult(null);
    setActiveTab('output');
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-code`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ language, code, stdin }),
      });
      const data = (await res.json()) as RunResult;
      setRunResult(data);
    } catch (err) {
      setRunResult({ error: err instanceof Error ? err.message : 'Failed to run code' });
    } finally {
      setRunning(false);
    }
  }

  function handleDownload() {
    const lang = getLanguage(language);
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solution.${lang.extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyRoomId() {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function loadProblem(problem: Problem) {
    setSelectedProblem(problem);
    const lang = getLanguage(language);
    const fullCode = `// Problem: ${problem.title} (${problem.difficulty})\n// ${problem.description.split('\n')[0]}\n\n${problem.template}\n`;
    setCode(fullCode);
    lastSavedCode.current = fullCode;
    if (editorRef.current) editorRef.current.setValue(fullCode);
    supabase.from('rooms').update({ code: fullCode }).eq('room_id', roomId);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center flex-col gap-4">
        <p className="text-red-400 text-lg">{error}</p>
        <button onClick={onLeave} className="text-blue-400 hover:text-blue-300">Go back</button>
      </div>
    );
  }

  const lang = getLanguage(language);

  return (
    <div className="h-screen bg-[#0d1117] text-gray-100 flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex-shrink-0 border-b border-gray-800 bg-[#161b22] px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onLeave}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0"
            title="Leave room"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
              <Code2 className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">{roomName}</h1>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-mono">{roomId}</span>
              <button onClick={copyRoomId} className="text-gray-500 hover:text-gray-300 transition-colors">
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Participants */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0d1117] rounded-lg border border-gray-800">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-medium">{(peers.length + 1)}</span>
            <span className="text-xs text-gray-500 hidden sm:inline">online</span>
          </div>

          {/* Voice toggle */}
          <button
            onClick={handleToggleMic}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium ${
              micOn
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : 'bg-[#0d1117] border-gray-800 text-gray-300 hover:text-white'
            }`}
            title={permissionError ?? (micOn ? 'Mute microphone' : 'Join voice chat')}
          >
            {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{micOn ? 'Voice on' : 'Voice'}</span>
          </button>

          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-[#0d1117] border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>

          {/* Sidebar toggle */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors lg:hidden"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${showSidebar ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Permission error toast */}
        {permissionError && (
          <div className="absolute top-14 right-4 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg px-3 py-2 shadow-lg">
            Voice: {permissionError}
          </div>
        )}
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Problems sidebar */}
        <aside className={`flex-shrink-0 w-64 border-r border-gray-800 bg-[#161b22] flex flex-col overflow-hidden ${showSidebar ? 'flex' : 'hidden'} lg:flex`}>
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Problems</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {PROBLEMS.map((p) => (
              <button
                key={p.id}
                onClick={() => loadProblem(p)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                  selectedProblem?.id === p.id
                    ? 'bg-blue-500/10 border border-blue-500/30'
                    : 'hover:bg-gray-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-200 group-hover:text-white">{p.title}</span>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  p.difficulty === 'Easy' ? 'bg-emerald-500/10 text-emerald-400' :
                  p.difficulty === 'Medium' ? 'bg-amber-500/10 text-amber-400' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  {p.difficulty}
                </span>
              </button>
            ))}
          </div>

          {/* Problem description */}
          {selectedProblem && (
            <div className="border-t border-gray-800 p-4 max-h-48 overflow-y-auto">
              <h3 className="text-sm font-semibold mb-2">{selectedProblem.title}</h3>
              <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{selectedProblem.description}</p>
            </div>
          )}
        </aside>

        {/* Center: Editor + Run */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Editor + cursor overlay */}
          <div className="flex-1 overflow-hidden relative">
            <Editor
              height="100%"
              language={lang.monacoId}
              value={code}
              theme="vs-dark"
              onMount={handleEditorMount}
              onChange={handleEditorChange}
              options={{
                fontSize: 14,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                lineNumbers: 'on',
                renderWhitespace: 'selection',
                tabSize: 4,
                wordWrap: 'on',
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
              }}
            />
            <CursorOverlay peers={peers} editorSelector=".monaco-editor" />
          </div>

          {/* Bottom: stdin + run */}
          <div className="flex-shrink-0 border-t border-gray-800 bg-[#161b22] p-3">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Input (stdin)</label>
                <textarea
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  placeholder="Enter input for your program..."
                  rows={2}
                  className="w-full bg-[#0d1117] border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  title="Download code"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Download</span>
                </button>
                <button
                  onClick={handleRunCode}
                  disabled={running}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Run Code
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* Right: Tabs (chat / output / history) */}
        <aside className="flex-shrink-0 w-80 border-l border-gray-800 bg-[#161b22] flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            {[
              { id: 'chat' as Tab, label: 'Chat', icon: MessageSquare },
              { id: 'people' as Tab, label: 'People', icon: Users },
              { id: 'output' as Tab, label: 'Output', icon: Terminal },
              { id: 'history' as Tab, label: 'History', icon: History },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === t.id
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Chat */}
            {activeTab === 'chat' && (
              <>
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.length === 0 && (
                    <p className="text-center text-xs text-gray-600 mt-8">No messages yet. Start the conversation!</p>
                  )}
                  {messages.map((m) => {
                    const isMe = m.user_id === user?.id;
                    return (
                      <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-xs text-gray-500 mb-1 px-1">
                          {isMe ? 'You' : m.sender_name}
                        </span>
                        <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-gray-800 text-gray-200 rounded-bl-md'
                        }`}>
                          {m.message}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form onSubmit={handleSendMessage} className="flex-shrink-0 p-3 border-t border-gray-800 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-[#0d1117] border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            )}

            {/* People */}
            {activeTab === 'people' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <div className="flex items-start gap-2 px-3 py-2.5 bg-[#0d1117] rounded-lg border border-gray-800">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white" style={{ backgroundColor: myColor }}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-100 truncate">{displayName}</span>
                      <span className="text-xs text-gray-500">(you)</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs text-gray-500">active in room</span>
                      {micOn && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 ml-1">
                          <Mic className="w-3 h-3" /> voice on
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {peers.length === 0 && (
                  <p className="text-center text-xs text-gray-600 mt-6">
                    No one else here yet. Share the room ID to invite friends.
                  </p>
                )}
                {peers.map((p) => {
                  const speaking = speakingPeers.has(p.userId);
                  return (
                    <div key={p.userId} className="flex items-start gap-2 px-3 py-2.5 bg-[#0d1117] rounded-lg border border-gray-800">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white" style={{ backgroundColor: p.color }}>
                        {p.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-100 truncate block">{p.displayName}</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-xs text-gray-500">active in room</span>
                          {p.micOn && (
                            <span className={`flex items-center gap-1 text-xs ml-1 ${speaking ? 'text-emerald-400' : 'text-gray-500'}`}>
                              <Radio className={`w-3 h-3 ${speaking ? 'animate-pulse' : ''}`} />
                              {speaking ? 'speaking' : 'voice on'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Output */}
            {activeTab === 'output' && (
              <div className="flex-1 overflow-y-auto p-3">
                {running && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running code...
                  </div>
                )}
                {!running && !runResult && (
                  <p className="text-center text-xs text-gray-600 mt-8">
                    Click "Run Code" to execute your program.
                  </p>
                )}
                {!running && runResult && (
                  <div className="space-y-3">
                    {runResult.error && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <p className="text-xs font-medium text-red-400 mb-1">Error</p>
                        <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">{runResult.error}</pre>
                      </div>
                    )}
                    {runResult.compile && runResult.compile.stderr && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                        <p className="text-xs font-medium text-amber-400 mb-1">Compilation Output</p>
                        <pre className="text-xs text-amber-300 whitespace-pre-wrap font-mono overflow-x-auto">{runResult.compile.stderr}</pre>
                      </div>
                    )}
                    {runResult.run && (
                      <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-gray-400">Program Output</p>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            runResult.run.code === 0
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}>
                            {runResult.run.code === 0 ? 'Success' : `Exit ${runResult.run.code}`}
                          </span>
                        </div>
                        <pre className="text-xs text-gray-200 whitespace-pre-wrap font-mono overflow-x-auto min-h-[2rem]">
                          {runResult.run.stdout || '(no output)'}
                        </pre>
                        {runResult.run.stderr && (
                          <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono mt-2 border-t border-gray-800 pt-2">
                            {runResult.run.stderr}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* History */}
            {activeTab === 'history' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {history.length === 0 && (
                  <p className="text-center text-xs text-gray-600 mt-8">No code history yet.</p>
                )}
                {history.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 bg-[#0d1117] rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-blue-400">{h.user_name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-300">
                        <span className="font-medium">{h.user_name}</span> saved code
                      </p>
                      <p className="text-xs text-gray-600">
                        {new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
