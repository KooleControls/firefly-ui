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
    async function loadGuests() {
      try {
        setLoading(true)
        const data = await api.guest.getAll()
        setGuests(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch guests")
      } finally {
        setLoading(false)
      }
    }
    loadGuests()
  }, [])

  return (
    <div className="flex flex-col flex-1 px-4 lg:px-6 py-4 space-y-8">
      {/* Leaderboard Card */}
      <Card className="max-w-lg">
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
