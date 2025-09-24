// api.ts

export type SettingType = "string" | "integer" | "float" | "boolean" | "enum";

export interface EnumOption {
  value: number | string;
  name: string;
}

export interface DeviceSetting {
  name: string;
  type: SettingType;
  value: string | number | boolean;
  default: string | number | boolean;
  options?: EnumOption[]; // required for type === "enum"
}

export interface DeviceSettingsContainer {
  name: string; // e.g., "System", "Smarthome"
  settings: DeviceSetting[];
}

// --------------------
// Settings Endpoints
// --------------------

const API_BASEURL = import.meta.env.VITE_API_BASEURL ?? "";

// GET /api/settings
export async function fetchDeviceSettings(): Promise<DeviceSettingsContainer[]> {
  const res = await fetch(`${API_BASEURL}/api/settings`);
  if (!res.ok) {
    throw new Error(`Failed to fetch device settings: ${res.status}`);
  }

  const data: DeviceSettingsContainer[] = await res.json();

  // Ensure enums always have `options`
  data.forEach(container => {
    container.settings.forEach(setting => {
      if (setting.type === "enum" && !setting.options) {
        setting.options = []; // fallback to avoid runtime errors
      }
    });
  });

  return data;
}

export interface UpdateSettingRequest {
  container: string;
  name: string;
  value: string | number | boolean; // could be enum index or string
}

// PUT /api/settings
export async function updateDeviceSetting(payload: UpdateSettingRequest): Promise<void> {
  const res = await fetch(`${API_BASEURL}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorBody: string | undefined;
    try {
      errorBody = await res.text();
    } catch {
      errorBody = undefined;
    }

    throw new Error(
      `Failed to update setting:\n` +
      `${res.status} ${res.statusText}:\n` +
      (errorBody ? `${errorBody}` : "")
    );
    
  }
}


// --------------------
// Command Endpoints
// --------------------

export interface CommandResponse {
  result: string;
  status?: string;
}

// POST /api/command
export async function sendCommand(command: string): Promise<CommandResponse> {
  const res = await fetch(`${API_BASEURL}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  if (!res.ok) {
    throw new Error(`Command failed: ${res.status}`);
  }
  return res.json();
}
