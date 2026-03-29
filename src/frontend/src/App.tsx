import { useState } from "react";
import Calculator from "./components/Calculator";
import ChatRoom from "./components/ChatRoom";

export type View = "calculator" | "chat";

export default function App() {
  const [view, setView] = useState<View>("calculator");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      {view === "calculator" ? (
        <Calculator onUnlock={() => setView("chat")} />
      ) : (
        <ChatRoom onExit={() => setView("calculator")} />
      )}
    </div>
  );
}
