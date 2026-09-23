import {
  OxygenApiError,
  createOxygenClient,
  getOxygenConfig,
} from "../oxygen/client.server";

export type ConnectionCheck =
  | { status: "unconfigured"; baseUrl: string }
  | {
      status: "ok";
      baseUrl: string;
      title: string | null;
      version: string | null;
      environment: string | null;
      productionWarning: boolean;
    }
  | { status: "error"; baseUrl: string | null; message: string };

/**
 * GET / on the configured Oxygen base URL.
 * Skips the network call when OXYGEN_API_KEY is missing.
 * Does not call production: getOxygenConfig rejects api.oxygen.gr.
 */
export async function checkOxygenConnection(): Promise<ConnectionCheck> {
  let baseUrl: string | null = null;
  try {
    const config = getOxygenConfig();
    baseUrl = config.baseUrl;
    if (!config.apiKey) {
      return { status: "unconfigured", baseUrl: config.baseUrl };
    }

    const info = await createOxygenClient().getServiceInfo();
    const environment = info.environment ?? null;
    return {
      status: "ok",
      baseUrl: config.baseUrl,
      title: info.title ?? null,
      version: info.version ?? null,
      environment,
      productionWarning: environment?.toLowerCase() === "production",
    };
  } catch (error) {
    const message =
      error instanceof OxygenApiError
        ? `${error.message}: ${error.responseBody}`
        : error instanceof Error
          ? error.message
          : "Unknown Oxygen error";
    return { status: "error", baseUrl, message };
  }
}
