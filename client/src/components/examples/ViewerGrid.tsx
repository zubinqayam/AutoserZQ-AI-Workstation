import { useState } from "react";
import ViewerGrid from '../ViewerGrid';

export default function ViewerGridExample() {
  const [urls, setUrls] = useState([
    "https://www.example.com",
    "https://www.wikipedia.org",
    "",
    ""
  ]);
  const [collapsed, setCollapsed] = useState([false, false, false, false]);

  const handleUrlChange = (index: number, url: string) => {
    const newUrls = [...urls];
    newUrls[index] = url;
    setUrls(newUrls);
  };

  const handleCollapsedChange = (index: number, isCollapsed: boolean) => {
    const newCollapsed = [...collapsed];
    newCollapsed[index] = isCollapsed;
    setCollapsed(newCollapsed);
  };

  return (
    <div className="h-[600px]">
      <ViewerGrid
        urls={urls}
        collapsed={collapsed}
        safeMode={true}
        onUrlChange={handleUrlChange}
        onCollapsedChange={handleCollapsedChange}
      />
    </div>
  );
}
