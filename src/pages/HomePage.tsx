"use client"
import { useEffect, useState } from "react"
import { api } from "@/components/api"
import type { Guest } from "@/components/api/guest"

import { DeviceTable } from "@/components/DeviceTable"
import { Leaderboard } from "@/components/Leaderboard"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

export default function HomePage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let es: EventSource | null = null

    async function loadGuests() {
      try {
        setLoading(true)
        const data = await api.guest.getAll()
        setGuests(data)

        // subscribe to SSE after first load
        es = api.guest.subscribe(setGuests)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch guests")
      } finally {
        setLoading(false)
      }
    }

    loadGuests()

    return () => {
      if (es) es.close()
    }
  }, [])

  return (
    <div className="flex flex-col flex-1 px-4 lg:px-6 py-4 space-y-8">
      {/* Leaderboard Card */}
      <Card className="max-w-4xl max-h-[500px] overflow-y-auto">
        <CardHeader>
          <CardTitle>Guest Leaderboard</CardTitle>
          <CardDescription>Top 5 guests by button presses</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <p>Loading...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {!loading && !error && <Leaderboard devices={guests} />}
        </CardContent>
      </Card>

      {/* Guest Table Card */}
      <Card className="max-w-4xl max-h-[500px] overflow-y-auto">
        <CardHeader>
          <CardTitle>Guests</CardTitle>
          <CardDescription>All guests</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <p>Loading...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {!loading && !error && <DeviceTable devices={guests} />}
        </CardContent>
      </Card>
    </div>
  )
}
