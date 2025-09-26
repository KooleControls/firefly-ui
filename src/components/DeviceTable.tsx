import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Guest } from "./api/guest"


export function DeviceTable({ devices }: { devices: Guest[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>MAC Address</TableHead>
          <TableHead className="text-right">Button Presses</TableHead>
          <TableHead>Last Seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((device) => (
          <TableRow key={device.mac}>
            <TableCell className="font-mono">{device.mac}</TableCell>
            <TableCell className="text-right">{device.buttonPresses}</TableCell>
            <TableCell>
              {new Date(device.lastMessageTime).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
