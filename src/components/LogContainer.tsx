import React from "react";

type LogLevel = "error" | "warning" | "info" | "ok" | "default";

export function LogContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto text-sm font-mono whitespace-pre-wrap p-2 border rounded bg-muted">
      {children}
    </div>
  );
}

interface LogItemProps {
  level?: LogLevel;
  children: React.ReactNode;
  className?: string;
}

export function LogItem({ level = "default", children, className }: LogItemProps) {
  let colorClass = "";

  switch (level) {
    case "ok":
      colorClass = "text-green-500";
      break;
    case "warning":
      colorClass = "text-yellow-500";
      break;
    case "error":
      colorClass = "text-red-500";
      break;
    case "info":
      colorClass = "text-muted-foreground";
      break;
    case "default":
      colorClass = "";
      break;
  }

  const finalClass = [colorClass, className].filter(Boolean).join(" ");

  return <div className={finalClass}>{children}</div>;
}
