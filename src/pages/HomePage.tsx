import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert"
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react"



export function DeviceStatusAlert({ status, message }: { status: "ok" | "warning" | "error", message?: string }) {
  const config = {
    ok: {
      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
      title: "All good",
      variant: "success" as const,
    },
    warning: {
      icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
      title: "Warning",
      variant: "warning" as const, // stays valid
    },
    error: {
      icon: <XCircle className="h-4 w-4" />,
      title: "Error",
      variant: "destructive" as const,
    },
  }[status]
  

  return (
    <Alert variant={config.variant} className="w-[250px]">
      {config.icon}
      <AlertTitle>{config.title}</AlertTitle>
      {message && <AlertDescription>{message}</AlertDescription>}
    </Alert>
  )
}

export default function HomePage() {

  return (
    <div className="flex flex-col flex-1 px-4 lg:px-6 py-4 space-y-8">
      <DeviceStatusAlert status="ok" message="Device is online and running smoothly." />

      <DeviceStatusAlert status="warning" message="Connection lost, running in fallback." />

      <DeviceStatusAlert status="error" message="Couln't connect to thermostat." />

    </div>
  );
}
