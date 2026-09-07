import { requestUrl } from "obsidian";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Extracts a model name from an OpenAI-compatible list entry.
 * Non-string entries or missing names map to an empty string instead of
 * leaking undefined into the string[] result.
 */
function pickModelName(model: unknown): string {
    if (typeof model === "string") return model;
    if (!isRecord(model)) return "";
    const value = model.id || model.name;
    return typeof value === "string" ? value : "";
}

/**
 * GETs a JSON endpoint via Obsidian's requestUrl (mobile-safe, no CORS).
 * Returns the parsed JSON body, or null on network error / non-2xx / non-JSON body.
 */
async function fetchJson(url: string): Promise<unknown> {
    try {
        const { url: cleanUrl, headers } = extractAuthFromUrl(url);
        const response = await requestUrl({
            url: cleanUrl,
            method: "GET",
            headers,
            throw: false,
        });
        if (response.status < 200 || response.status >= 300) {
            return null;
        }
        return response.json;
    } catch {
        return null;
    }
}

export async function fetchLocalModels(endpoint: string): Promise<string[]> {
    try {
        const baseUrl = normalizeEndpoint(endpoint);
        const isOllama =
            baseUrl.includes("localhost:11434") || baseUrl.includes("ollama");

        // Special handling for Ollama
        if (isOllama) {
            // First try Ollama's specific API endpoint for listing models
            const ollamaData = await fetchJson(
                `${baseUrl.replace("/v1", "")}/api/tags`,
            );
            if (isRecord(ollamaData) && Array.isArray(ollamaData.models)) {
                return ollamaData.models.map((model: unknown) =>
                    isRecord(model) && typeof model.name === "string"
                        ? model.name
                        : "",
                );
            }

            // If that fails, try the Ollama list API
            const ollamaListData = await fetchJson(
                `${baseUrl.replace("/v1", "")}/api/list`,
            );
            if (
                isRecord(ollamaListData) &&
                Array.isArray(ollamaListData.models)
            ) {
                return ollamaListData.models.map((model: unknown) =>
                    isRecord(model) && typeof model.name === "string"
                        ? model.name
                        : "",
                );
            }
            // Otherwise fall through to the standard endpoint
        }

        // Standard OpenAI-compatible API endpoint; return empty array if it doesn't respond properly
        const data = await fetchJson(`${baseUrl}/models`);
        if (!data || !isRecord(data)) {
            return [];
        }

        let models: string[] = [];
        if (Array.isArray(data)) {
            models = data.map(pickModelName);
        } else if (Array.isArray(data.data)) {
            models = data.data.map(pickModelName);
        } else if (Array.isArray(data.models)) {
            models = data.models.map(pickModelName);
        }

        return models;
    } catch {
        //console.error('Error in fetchLocalModels:', error);
        return [];
    }
}

// Extract authentication information from URL and return both clean URL and auth headers
export function extractAuthFromUrl(url: string): {
    url: string;
    headers: Record<string, string>;
} {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    try {
        const urlObj = new URL(url);

        // Check if URL contains authentication information
        if (urlObj.username && urlObj.password) {
            // Create Basic Auth header
            const authString = `${urlObj.username}:${urlObj.password}`;
            const base64Auth = btoa(authString);
            headers["Authorization"] = `Basic ${base64Auth}`;

            // Remove auth info from URL
            urlObj.username = "";
            urlObj.password = "";
            return { url: urlObj.toString(), headers };
        }
    } catch (error) {
        // If URL parsing fails, return original URL
        console.error("Failed to parse URL:", error);
    }

    return { url, headers };
}

function normalizeEndpoint(endpoint: string): string {
    endpoint = endpoint.trim();
    endpoint = endpoint.replace(/\/$/, "");

    if (endpoint.endsWith("/v1/chat/completions")) {
        endpoint = endpoint.replace("/v1/chat/completions", "");
    }

    if (endpoint.endsWith("/api/generate")) {
        endpoint = endpoint.replace("/api/generate", "");
    }

    return endpoint;
}
