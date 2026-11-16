import React, { useState } from "react";
import { GannCanvas } from "./components/GannCanvas";
import { DraftingToolbar } from "./components/DraftingToolbar";
import { CoordinateOverlay } from "./components/CoordinateOverlay";

export const App: React.FC = () => {
  const [showGannRay, setShowGannRay] = useState(true);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#F7F6F0",
      }}
    >
      {/* Top Floating Drafting Toolbar */}
      <DraftingToolbar
        showGannRay={showGannRay}
        setShowGannRay={setShowGannRay}
      />

      {/* Primary High-Performance 1:1 Canvas Engine */}
      <GannCanvas
        showGannRay45={showGannRay}
      />

      {/* Bottom Floating Live Coordinate HUD */}
      <CoordinateOverlay />
    </div>
  );
};

export default App;
