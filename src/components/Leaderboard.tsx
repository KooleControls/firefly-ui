"use client"

import { BarChart, Bar, XAxis, YAxis, LabelList, ResponsiveContainer } from "recharts"
import type { Guest } from "./api/guest"


export function Leaderboard({ devices }: { devices: Guest[] }) {
  const chartData = [...devices]
    .sort((a, b) => b.buttonPresses - a.buttonPresses)
    .slice(0, 5)

  // each row ~32px tall
  const chartHeight = chartData.length * 32

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          barCategoryGap="10%"
          margin={{ top: 0, right: 0, left: 40, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            dataKey="mac"
            type="category"
            tickLine={false}
            axisLine={false}
            width={50}
            tickFormatter={(value: string) => value.slice(-8)}
          />
          <Bar dataKey="buttonPresses" radius={[4, 4, 4, 4]}>
            <LabelList
              dataKey="buttonPresses"
              position="right"
              className="fill-foreground text-xs"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
