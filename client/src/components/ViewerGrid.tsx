import ViewerPanel from "./ViewerPanel";

interface ViewerGridProps {
  urls: string[];
  collapsed: boolean[];
  safeMode: boolean;
  onUrlChange?: (index: number, url: string) => void;
  onCollapsedChange?: (index: number, collapsed: boolean) => void;
}

export default function ViewerGrid({
  urls,
  collapsed,
  safeMode,
  onUrlChange,
  onCollapsedChange,
}: ViewerGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 p-3 h-full">
      {urls.map((url, index) => (
        <ViewerPanel
          key={index}
          index={index}
          url={url}
          collapsed={collapsed[index]}
          safeMode={safeMode}
          onUrlChange={(newUrl) => onUrlChange?.(index, newUrl)}
          onCollapsedChange={(newCollapsed) => onCollapsedChange?.(index, newCollapsed)}
        />
      ))}
    </div>
  );
}
