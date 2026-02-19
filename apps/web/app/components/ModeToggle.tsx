"use client";

import styles from "./ModeToggle.module.css";

type ModeToggleProps = {
  mode: "customer" | "expert";
  onModeChange: (mode: "customer" | "expert") => void;
};

export default function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  const isExpert = mode === "expert";
  return (
    <button
      type="button"
      onClick={() => onModeChange(isExpert ? "customer" : "expert")}
      className={`${styles.button} ${
        isExpert ? styles.buttonExpert : styles.buttonCustomer
      }`}
      aria-label="Toggle customer/expert mode"
      aria-pressed={isExpert}
    >
      <i
        className={isExpert ? "fa-solid fa-toggle-on" : "fa-solid fa-toggle-off"}
        aria-hidden="true"
      />
      <span>{isExpert ? "Expert" : "Customer"}</span>
    </button>
  );
}
