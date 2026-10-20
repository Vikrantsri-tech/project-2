import { useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AuthScreen from '@/components/AuthScreen';
import LandingPage from '@/components/LandingPage';
import RoomPage from '@/components/RoomPage';
import { Loader2 } from 'lucide-react';
import type { Room } from '@/lib/types';

function AppContent() {
  const { session, loading } = useAuth();
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (activeRoom) {
    return <RoomPage roomId={activeRoom.room_id} onLeave={() => setActiveRoom(null)} />;
  }

  return <LandingPage onEnterRoom={setActiveRoom} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
