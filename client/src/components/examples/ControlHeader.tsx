import { useState } from "react";
import ControlHeader from '../ControlHeader';

export default function ControlHeaderExample() {
  const [safeMode, setSafeMode] = useState(true);
  const [roomOpen, setRoomOpen] = useState(true);

  return (
    <ControlHeader
      roomId="demo-room"
      isOwner={true}
      roomOpen={roomOpen}
      onToggleLock={() => setRoomOpen(!roomOpen)}
      onMinimizeAll={() => console.log('Minimize all')}
      onRestoreAll={() => console.log('Restore all')}
      safeMode={safeMode}
      onSafeModeChange={setSafeMode}
    />
  );
}
