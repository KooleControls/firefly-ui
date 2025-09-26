import { baseApi } from "./base";

export interface Guest {
  mac: string; // formatted string "AA:BB:CC:DD:EE:FF"
  lastMessageTime: string; // ISO timestamp
  buttonPresses: number;
}

function decodeBase64MacToString(mac: string): string {
  const binary = atob(mac); // base64 -> binary
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

  async resetButtonPresses(mac: string): Promise<void> {
    return baseApi.put<void>(`/api/guests/${mac}/reset`);
  },

  async delete(mac: string): Promise<void> {
    return baseApi.delete<void>(`/api/guests/${mac}`);
  },
};
