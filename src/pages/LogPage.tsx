import { LogContainer, LogItem } from "@/components/LogContainer"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

export default function HomePage() {
  return (
    <div className="flex flex-col flex-1 px-4 lg:px-6 py-4 space-y-8">
      <Card className="flex-1 w-full h-full overflow-y-auto">
        <CardHeader>
          <CardTitle>System Logs</CardTitle>
          <CardDescription>Recent activity and warnings</CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          <LogContainer>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
            <LogItem level="warning">Disk almost full</LogItem>
            <LogItem level="error">Failed to save file</LogItem>
            <LogItem level="ok">File saved successfully</LogItem>
            <LogItem level="info">Background job started</LogItem>
          </LogContainer>
        </CardContent>
      </Card>

    </div>
  )
}
