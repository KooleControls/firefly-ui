const API_BASEURL = import.meta.env.VITE_API_BASEURL ?? "";
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });

    if (!res.ok) {
      let errorBody: string | undefined;
      try {
        errorBody = await res.text();
      } catch {
        errorBody = undefined;
      }

      throw new Error(
        `API request failed:\n${res.status} ${res.statusText}\n` +
        (errorBody ? `${errorBody}` : "")
      );
    }

    return res.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  /**
   * Subscribe to Server-Sent Events (SSE).
   * Caller must close the EventSource when no longer needed.
   */
  sse<T>(path: string, onMessage: (data: T) => void, onError?: (err: any) => void): EventSource {
    const es = new EventSource(`${this.baseUrl}${path}`);

    es.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data) as T);
      } catch (err) {
        console.error("Failed to parse SSE payload:", e);
      }
    };

    es.onerror = (err) => {
      if (onError) {
        onError(err);
      } else {
        console.error("SSE error:", err);
      }
    };

    return es;
  }
}

export const baseApi = new ApiClient(API_BASEURL);
