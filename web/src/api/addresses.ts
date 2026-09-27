import { apiRequest } from "@/api/client"
import type { AddressSuggestion, SavedAddress, SavedAddressInput } from "@/types/address"

/** CUSTOMER only - always the signed-in customer's own saved shipping addresses. */

export async function getSavedAddresses(signal?: AbortSignal): Promise<SavedAddress[]> {
  const response = await apiRequest<{ addresses: SavedAddress[] }>("/addresses", { authenticated: true, signal })
  return response.addresses
}

export async function createSavedAddress(input: SavedAddressInput): Promise<SavedAddress> {
  const response = await apiRequest<{ address: SavedAddress }>("/addresses", { method: "POST", body: input, authenticated: true })
  return response.address
}

export async function updateSavedAddress(id: string, input: SavedAddressInput): Promise<SavedAddress> {
  const response = await apiRequest<{ address: SavedAddress }>(`/addresses/${id}`, { method: "PUT", body: input, authenticated: true })
  return response.address
}

export async function setDefaultSavedAddress(id: string): Promise<SavedAddress> {
  const response = await apiRequest<{ address: SavedAddress }>(`/addresses/${id}/default`, { method: "PATCH", authenticated: true })
  return response.address
}

export async function deleteSavedAddress(id: string): Promise<void> {
  await apiRequest<void>(`/addresses/${id}`, { method: "DELETE", authenticated: true })
}

/** Reads a readable address off a map pin (server-side, so it can be matched to official PSGC codes). Never moves the pin. */
export async function lookupAddressForPin(latitude: number, longitude: number, signal?: AbortSignal): Promise<AddressSuggestion> {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) })
  const response = await apiRequest<{ suggestion: AddressSuggestion }>(`/addresses/reverse-geocode?${params.toString()}`, { authenticated: true, signal })
  return response.suggestion
}
