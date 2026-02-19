"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ProviderOrderPanel.module.css";

type ProviderOffer = {
  provider: string;
  product_type: string;
  offer_id: string;
  name: string;
  region: string;
  location_label: string;
  cpu_cores: number;
  ram_gb: number;
  storage: { gb: number; type: string };
  network: {
    ipv4_included: boolean;
    traffic_included_gb: number;
    backups?: boolean;
    snapshots?: boolean;
  };
  pricing: { interval: string; currency: string; monthly_total: number };
};

type ProviderOrderPanelProps = {
  baseUrl: string;
  workspaceId: string | null;
  primaryDomain: string;
  mode: "customer" | "expert";
  onOrderedServer: (server: {
    alias: string;
    ansible_host: string;
    ansible_user: string;
    ansible_port: number;
    requirementServerType?: string;
    requirementStorageGb?: string;
    requirementLocation?: string;
  }) => void;
};

export default function ProviderOrderPanel({
  baseUrl,
  workspaceId,
  primaryDomain,
  mode,
  onOrderedServer,
}: ProviderOrderPanelProps) {
  const [offers, setOffers] = useState<ProviderOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customerType, setCustomerType] = useState("vps");
  const [customerStorage, setCustomerStorage] = useState("200");
  const [customerLocation, setCustomerLocation] = useState("Germany");
  const [customerProvider, setCustomerProvider] = useState("auto");
  const [customerBudget, setCustomerBudget] = useState("");

  const [expertProviders, setExpertProviders] = useState<Record<string, boolean>>({});
  const [expertType, setExpertType] = useState("");
  const [expertRegion, setExpertRegion] = useState("");
  const [expertCpuMin, setExpertCpuMin] = useState("");
  const [expertRamMin, setExpertRamMin] = useState("");
  const [expertStorageMin, setExpertStorageMin] = useState("");
  const [expertStorageType, setExpertStorageType] = useState("");
  const [expertPriceMin, setExpertPriceMin] = useState("");
  const [expertPriceMax, setExpertPriceMax] = useState("");
  const [expertIpv4, setExpertIpv4] = useState(false);
  const [expertBackups, setExpertBackups] = useState(false);
  const [expertSnapshots, setExpertSnapshots] = useState(false);
  const [sortBy, setSortBy] = useState<"price" | "ram" | "cpu">("price");
  const [sortAsc, setSortAsc] = useState(true);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${baseUrl}/api/providers/offers`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!alive) return;
        const nextOffers: ProviderOffer[] = Array.isArray(data?.offers)
          ? (data.offers as ProviderOffer[])
          : [];
        setOffers(nextOffers);
        const providerFlags: Record<string, boolean> = {};
        Array.from(new Set(nextOffers.map((offer) => offer.provider))).forEach(
          (provider) => {
            providerFlags[String(provider)] = false;
          }
        );
        setExpertProviders(providerFlags);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message ?? "failed to load provider catalog");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [baseUrl]);

  const providerKeys = useMemo(
    () => Array.from(new Set(offers.map((offer) => offer.provider))).sort(),
    [offers]
  );

  const customerResults = useMemo(() => {
    const storageNeed = Number(customerStorage) || 0;
    const budget = Number(customerBudget) || 0;
    const locationNeedle = customerLocation.trim().toLowerCase();
    const filtered = offers.filter((offer) => {
      if (offer.product_type !== customerType) return false;
      if (customerProvider !== "auto" && offer.provider !== customerProvider) return false;
      if (storageNeed > 0 && Number(offer.storage?.gb || 0) < storageNeed) return false;
      if (
        locationNeedle &&
        !String(offer.location_label || "").toLowerCase().includes(locationNeedle)
      ) {
        return false;
      }
      if (budget > 0 && Number(offer.pricing?.monthly_total || 0) > budget) return false;
      return true;
    });
    const scored = filtered
      .map((offer) => {
        const storageDelta = Math.max(0, storageNeed - Number(offer.storage?.gb || 0));
        const price = Number(offer.pricing?.monthly_total || 0);
        const score = storageDelta * 10 + price;
        return { offer, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
    return scored.map((entry) => entry.offer);
  }, [
    offers,
    customerType,
    customerStorage,
    customerLocation,
    customerProvider,
    customerBudget,
  ]);

  const expertResults = useMemo(() => {
    const enabledProviders = Object.keys(expertProviders).filter((key) => expertProviders[key]);
    const cpuMin = Number(expertCpuMin) || 0;
    const ramMin = Number(expertRamMin) || 0;
    const storageMin = Number(expertStorageMin) || 0;
    const priceMin = Number(expertPriceMin) || 0;
    const priceMax = Number(expertPriceMax) || 0;

    const filtered = offers.filter((offer) => {
      if (enabledProviders.length > 0 && !enabledProviders.includes(offer.provider)) return false;
      if (expertType && offer.product_type !== expertType) return false;
      if (expertRegion && offer.region !== expertRegion) return false;
      if (cpuMin > 0 && Number(offer.cpu_cores || 0) < cpuMin) return false;
      if (ramMin > 0 && Number(offer.ram_gb || 0) < ramMin) return false;
      if (storageMin > 0 && Number(offer.storage?.gb || 0) < storageMin) return false;
      if (expertStorageType && String(offer.storage?.type || "") !== expertStorageType) return false;
      const price = Number(offer.pricing?.monthly_total || 0);
      if (priceMin > 0 && price < priceMin) return false;
      if (priceMax > 0 && price > priceMax) return false;
      if (expertIpv4 && !offer.network?.ipv4_included) return false;
      if (expertBackups && !offer.network?.backups) return false;
      if (expertSnapshots && !offer.network?.snapshots) return false;
      return true;
    });

    const sortFactor = sortAsc ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sortBy === "cpu") return (Number(a.cpu_cores || 0) - Number(b.cpu_cores || 0)) * sortFactor;
      if (sortBy === "ram") return (Number(a.ram_gb || 0) - Number(b.ram_gb || 0)) * sortFactor;
      return (
        (Number(a.pricing?.monthly_total || 0) - Number(b.pricing?.monthly_total || 0)) * sortFactor
      );
    });
  }, [
    offers,
    expertProviders,
    expertType,
    expertRegion,
    expertCpuMin,
    expertRamMin,
    expertStorageMin,
    expertStorageType,
    expertPriceMin,
    expertPriceMax,
    expertIpv4,
    expertBackups,
    expertSnapshots,
    sortBy,
    sortAsc,
  ]);

  const placeOrder = async (offer: ProviderOffer) => {
    if (!workspaceId) {
      setOrderError("Workspace is not ready yet.");
      return;
    }
    setOrderError(null);
    const summary = `${offer.provider.toUpperCase()} ${offer.name} in ${offer.location_label}\n${offer.cpu_cores} CPU / ${offer.ram_gb} GB RAM / ${offer.storage?.gb} GB ${offer.storage?.type}\n${offer.pricing?.monthly_total} ${offer.pricing?.currency} per month`;
    const confirmed = window.confirm(`Order this server?\n\n${summary}`);
    if (!confirmed) return;

    setBusyOfferId(offer.offer_id);
    try {
      const res = await fetch(`${baseUrl}/api/providers/order/server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          offer_id: offer.offer_id,
          provider: offer.provider,
          primary_domain: String(primaryDomain || "").trim() || undefined,
          confirm: true,
        }),
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.detail) message = data.detail;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const data = await res.json();
      const device = data?.device;
      if (device?.alias && device?.ansible_host && device?.ansible_user) {
        const requirementServerType = String(offer.product_type || "vps")
          .trim()
          .toLowerCase();
        const parsedStorage = Number(offer.storage?.gb ?? 0);
        const requirementStorageGb =
          Number.isFinite(parsedStorage) && parsedStorage > 0
            ? String(Math.floor(parsedStorage))
            : "200";
        const requirementLocation =
          String(offer.location_label || "").trim() || "Germany";
        onOrderedServer({
          alias: String(device.alias),
          ansible_host: String(device.ansible_host),
          ansible_user: String(device.ansible_user),
          ansible_port: Number(device.ansible_port || 22),
          requirementServerType,
          requirementStorageGb,
          requirementLocation,
        });
      }
    } catch (err: any) {
      setOrderError(err?.message ?? "ordering failed");
    } finally {
      setBusyOfferId(null);
    }
  };

  return (
    <div className={styles.root}>
      {loading ? <div className={styles.hint}>Loading provider catalog...</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      {orderError ? <div className={styles.error}>{orderError}</div> : null}

      {mode === "customer" ? (
        <div>
          <div className={styles.customerInputs}>
            <label>
              Server type
              <select value={customerType} onChange={(event) => setCustomerType(event.target.value)}>
                <option value="vps">VPS</option>
                <option value="dedicated">Dedicated</option>
                <option value="managed">Managed</option>
              </select>
            </label>
            <label>
              Storage (GB)
              <input
                type="number"
                min={20}
                value={customerStorage}
                onChange={(event) => setCustomerStorage(event.target.value)}
              />
            </label>
            <label>
              Location
              <input value={customerLocation} onChange={(event) => setCustomerLocation(event.target.value)} />
            </label>
            <label>
              Provider
              <select value={customerProvider} onChange={(event) => setCustomerProvider(event.target.value)}>
                <option value="auto">Auto</option>
                {providerKeys.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Budget cap (optional)
              <input
                type="number"
                min={0}
                step="0.01"
                value={customerBudget}
                onChange={(event) => setCustomerBudget(event.target.value)}
              />
            </label>
          </div>
          <div className={styles.cardGrid}>
            {customerResults.map((offer) => (
              <div key={`${offer.provider}:${offer.offer_id}`} className={styles.offerCard}>
                <strong>{offer.name}</strong>
                <span>{offer.provider.toUpperCase()} · {offer.location_label}</span>
                <span>
                  {offer.cpu_cores} CPU / {offer.ram_gb} GB RAM / {offer.storage?.gb} GB {offer.storage?.type}
                </span>
                <span>
                  {offer.pricing?.monthly_total} {offer.pricing?.currency} / {offer.pricing?.interval}
                </span>
                <button
                  type="button"
                  disabled={!workspaceId || busyOfferId === offer.offer_id}
                  onClick={() => void placeOrder(offer)}
                >
                  {busyOfferId === offer.offer_id ? "Ordering..." : "Order"}
                </button>
              </div>
            ))}
            {customerResults.length === 0 ? <div className={styles.hint}>No offers match the current input.</div> : null}
          </div>
        </div>
      ) : (
        <div>
          <div className={styles.expertFilters}>
            <div className={styles.providerChecks}>
              {providerKeys.map((provider) => (
                <label key={provider}>
                  <input
                    type="checkbox"
                    checked={Boolean(expertProviders[provider])}
                    onChange={(event) =>
                      setExpertProviders((prev) => ({ ...prev, [provider]: event.target.checked }))
                    }
                  />
                  {provider}
                </label>
              ))}
            </div>
            <input placeholder="Type (vps/dedicated/managed)" value={expertType} onChange={(e) => setExpertType(e.target.value)} />
            <input placeholder="Region" value={expertRegion} onChange={(e) => setExpertRegion(e.target.value)} />
            <input placeholder="CPU min" type="number" value={expertCpuMin} onChange={(e) => setExpertCpuMin(e.target.value)} />
            <input placeholder="RAM min" type="number" value={expertRamMin} onChange={(e) => setExpertRamMin(e.target.value)} />
            <input placeholder="Storage min" type="number" value={expertStorageMin} onChange={(e) => setExpertStorageMin(e.target.value)} />
            <input placeholder="Storage type" value={expertStorageType} onChange={(e) => setExpertStorageType(e.target.value)} />
            <input placeholder="Price min" type="number" value={expertPriceMin} onChange={(e) => setExpertPriceMin(e.target.value)} />
            <input placeholder="Price max" type="number" value={expertPriceMax} onChange={(e) => setExpertPriceMax(e.target.value)} />
            <label><input type="checkbox" checked={expertIpv4} onChange={(e) => setExpertIpv4(e.target.checked)} /> IPv4 included</label>
            <label><input type="checkbox" checked={expertBackups} onChange={(e) => setExpertBackups(e.target.checked)} /> Backups</label>
            <label><input type="checkbox" checked={expertSnapshots} onChange={(e) => setExpertSnapshots(e.target.checked)} /> Snapshots</label>
            <div className={styles.sortRow}>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "price" | "ram" | "cpu")}>
                <option value="price">Sort by price</option>
                <option value="ram">Sort by RAM</option>
                <option value="cpu">Sort by CPU</option>
              </select>
              <button type="button" onClick={() => setSortAsc((prev) => !prev)}>
                {sortAsc ? "Ascending" : "Descending"}
              </button>
            </div>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Plan</th>
                <th>Region</th>
                <th>Specs</th>
                <th>Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {expertResults.map((offer) => (
                <tr key={`${offer.provider}:${offer.offer_id}`}>
                  <td>{offer.provider}</td>
                  <td>{offer.name}</td>
                  <td>{offer.region}</td>
                  <td>
                    {offer.cpu_cores} CPU / {offer.ram_gb} GB / {offer.storage?.gb} GB {offer.storage?.type}
                  </td>
                  <td>
                    {offer.pricing?.monthly_total} {offer.pricing?.currency}
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={!workspaceId || busyOfferId === offer.offer_id}
                      onClick={() => void placeOrder(offer)}
                    >
                      {busyOfferId === offer.offer_id ? "Ordering..." : "Order"}
                    </button>
                  </td>
                </tr>
              ))}
              {expertResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.hint}>
                    No offers match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
