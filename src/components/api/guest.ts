import { baseApi } from "./base";

export interface Guest {
  mac: string;
  lastMessageTime: string;
  buttonPresses: number;
}

function decodeBase64MacToString(mac: string): string {
  const binary = atob(mac);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join(":")
    .toUpperCase();
}

export const guest = {
  async getAll(): Promise<Guest[]> {
    const raw = await baseApi.get<{ mac: string; lastMessageTime: string; buttonPresses: number }[]>(
      "/api/guests"
    );
    return raw.map(g => ({
      mac: decodeBase64MacToString(g.mac),
      lastMessageTime: g.lastMessageTime,
      buttonPresses: g.buttonPresses,
    }));
  },

  resetButtonPresses(mac: string): Promise<void> {
    return baseApi.put<void>(`/api/guests/${mac}/reset`);
  },

  delete(mac: string): Promise<void> {
    return baseApi.delete<void>(`/api/guests/${mac}`);
  },

  subscribe(onUpdate: (guests: Guest[]) => void): EventSource {
    return baseApi.sse<{ mac: string; lastMessageTime: string; buttonPresses: number }[]>(
      "/api/guests/events",
      (raw) => {
        const guests = raw.map(g => ({
          mac: decodeBase64MacToString(g.mac),
          lastMessageTime: g.lastMessageTime,
          buttonPresses: g.buttonPresses,
        }));
        onUpdate(guests);
      }
    );
  },
};
