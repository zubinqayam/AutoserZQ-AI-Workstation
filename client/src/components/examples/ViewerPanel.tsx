import { useState } from "react";
import ViewerPanel from '../ViewerPanel';

export default function ViewerPanelExample() {
  const [url, setUrl] = useState("https://www.example.com");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="h-96">
      <ViewerPanel
        index={0}
        url={url}
        collapsed={collapsed}
        safeMode={true}
        onUrlChange={setUrl}
        onCollapsedChange={setCollapsed}
      />
    </div>
  );
}
