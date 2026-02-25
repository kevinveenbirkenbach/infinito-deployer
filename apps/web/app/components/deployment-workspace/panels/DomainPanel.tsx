import styles from "../../DeploymentWorkspace.module.css";
import {
  DEFAULT_PRIMARY_DOMAIN,
  normalizeDomainName,
} from "../domain-utils";
import type {
  DomainEntry,
  DomainFilterKind,
  DomainKind,
} from "../types";

type DomainPanelProps = {
  filterQuery: string;
  onFilterQueryChange: (value: string) => void;
  filterKind: DomainFilterKind;
  onFilterKindChange: (value: DomainFilterKind) => void;
  onOpenAddDomain: (kind?: DomainKind) => void;
  primaryDomainError: string | null;
  filteredEntries: DomainEntry[];
  allEntries: DomainEntry[];
  domainUsageByName: Map<string, number>;
  primaryDomainDraft: string;
  onSelectPrimaryDomain: (domain: string) => void;
  onOpenAddSubdomain: (parentFqdn: string) => void;
  onRemoveDomain: (domain: string) => void;
};

export default function DomainPanel({
  filterQuery,
  onFilterQueryChange,
  filterKind,
  onFilterKindChange,
  onOpenAddDomain,
  primaryDomainError,
  filteredEntries,
  allEntries,
  domainUsageByName,
  primaryDomainDraft,
  onSelectPrimaryDomain,
  onOpenAddSubdomain,
  onRemoveDomain,
}: DomainPanelProps) {
  return (
    <div className={styles.domainPanel}>
      <div className={styles.domainTableFilters}>
        <input
          value={filterQuery}
          onChange={(event) => onFilterQueryChange(event.target.value)}
          placeholder="Filter domains"
          className={`form-control ${styles.domainFilterInput}`}
        />
        <select
          value={filterKind}
          onChange={(event) => onFilterKindChange(event.target.value as DomainFilterKind)}
          className={`form-select ${styles.domainFilterSelect}`}
        >
          <option value="all">All types</option>
          <option value="local">Local</option>
          <option value="fqdn">FQDN</option>
          <option value="subdomain">Subdomain</option>
        </select>
        <button
          type="button"
          onClick={() => onOpenAddDomain("fqdn")}
          className={styles.modeActionButton}
        >
          <i className="fa-solid fa-plus" aria-hidden="true" />
          <span>Add new</span>
        </button>
      </div>

      {primaryDomainError ? (
        <p className={styles.primaryDomainError}>{primaryDomainError}</p>
      ) : null}

      <div className={styles.domainTableWrap}>
        <table className={styles.domainTable}>
          <thead>
            <tr>
              <th>Default</th>
              <th>Domain</th>
              <th>Type</th>
              <th>Parent FQDN</th>
              <th>Devices</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.domainTableEmpty}>
                  No domains match the current filter.
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => {
                const domainKey = normalizeDomainName(entry.domain);
                const inUse = (domainUsageByName.get(domainKey) || 0) > 0;
                const hasChildren = allEntries.some(
                  (item) =>
                    item.kind === "subdomain" &&
                    normalizeDomainName(item.parentFqdn || "") === domainKey
                );
                const removeBlocked =
                  domainKey === DEFAULT_PRIMARY_DOMAIN || hasChildren || inUse;
                const removeTitle =
                  domainKey === DEFAULT_PRIMARY_DOMAIN
                    ? "localhost is required."
                    : hasChildren
                    ? "Remove subdomains first."
                    : inUse
                    ? "Reassign devices before removing this domain."
                    : "Remove domain";
                const addSubdomainParent =
                  entry.kind === "fqdn"
                    ? normalizeDomainName(entry.domain)
                    : entry.kind === "subdomain"
                    ? normalizeDomainName(entry.parentFqdn || "")
                    : "";
                const addSubdomainBlocked = !addSubdomainParent;
                const addSubdomainTitle = addSubdomainBlocked
                  ? "Subdomains require a FQDN parent."
                  : `Add subdomain under ${addSubdomainParent}`;

                return (
                  <tr key={entry.id}>
                    <td>
                      <input
                        type="radio"
                        name="workspace-primary-domain-radio"
                        checked={normalizeDomainName(primaryDomainDraft) === domainKey}
                        onChange={() => onSelectPrimaryDomain(entry.domain)}
                        aria-label={`Set ${entry.domain} as workspace primary domain`}
                      />
                    </td>
                    <td>
                      <code>{entry.domain}</code>
                    </td>
                    <td>{entry.kind}</td>
                    <td>{entry.parentFqdn ? <code>{entry.parentFqdn}</code> : "-"}</td>
                    <td>{domainUsageByName.get(domainKey) || 0}</td>
                    <td>
                      <div className={styles.domainActionRow}>
                        <button
                          type="button"
                          onClick={() => onOpenAddSubdomain(addSubdomainParent)}
                          disabled={addSubdomainBlocked}
                          title={addSubdomainTitle}
                          className={styles.domainActionButton}
                        >
                          <i className="fa-solid fa-sitemap" aria-hidden="true" />
                          <span>Add subdomain</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveDomain(entry.domain)}
                          disabled={removeBlocked}
                          title={removeTitle}
                          className={styles.domainRemoveButton}
                        >
                          <i className="fa-solid fa-trash" aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
