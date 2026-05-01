import { Fragment, useEffect, useState } from "react";

type TierKey = "insurer" | "pbm" | "pharmacy";

type Tier = {
  key: TierKey;
  label: string;
  accent: string;
};

const conglomerates = [
  {
    parent: "UnitedHealth Group",
    insurer: "UnitedHealthcare",
    pbm: "OptumRx",
    pharmacy: "Optum Pharmacy",
  },
  {
    parent: "CVS Health",
    insurer: "Aetna",
    pbm: "CVS Caremark",
    pharmacy: "CVS Pharmacy",
  },
  {
    parent: "Cigna / Evernorth",
    insurer: "Cigna Healthcare",
    pbm: "Express Scripts",
    pharmacy: "Accredo",
  },
] as const;

const tiers: Tier[] = [
  { key: "insurer", label: "Insurer", accent: "#e09c41" },
  { key: "pbm", label: "Pharmacy Benefit Manager", accent: "#4a7ab5" },
  { key: "pharmacy", label: "Pharmacy", accent: "#6a9f58" },
];

const ROW_LABEL_WIDTH = 168;
const CONNECTOR_GAP = 20;
const MOBILE_BREAKPOINT = 640;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function PBMConglomeratesDiagram() {
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        padding: isMobile ? "20px 16px 16px" : "28px 24px 20px",
        fontFamily: "inherit",
        background: "var(--oc-bg, #fbfaf7)",
        color: "var(--oc-text, #1f2937)",
      }}
    >
      <div
        style={{
          fontSize: isMobile ? 16 : 17,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          marginBottom: 4,
          color: "var(--oc-text, #111827)",
        }}
      >
        Three conglomerates own the insurer, PBM, and pharmacy
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--oc-text-muted, #6b7280)",
          marginBottom: isMobile ? 20 : 28,
          maxWidth: 640,
        }}
      >
        The Big 3 PBMs control roughly 80% of US prescription claims, covering
        270 million people. Each parent owns the insurer that decides coverage,
        the PBM that negotiates the price, and the pharmacy that fills the
        script.
      </div>

      {isMobile ? (
        <MobileLayout />
      ) : (
        <DesktopLayout />
      )}

      <div
        style={{
          marginTop: 24,
          paddingTop: 12,
          borderTop: "1px solid var(--oc-border, #e5e7eb)",
          fontSize: 11,
          color: "var(--oc-text-muted, #94a3b8)",
        }}
      >
        Source: FTC Second Interim Staff Report on PBMs (January 2025), Drug
        Channels (March 2025)
      </div>
    </div>
  );
}

function DesktopLayout() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${ROW_LABEL_WIDTH}px repeat(3, 1fr)`,
        rowGap: 0,
        columnGap: 16,
        alignItems: "stretch",
      }}
    >
      {/* Header row: parent companies */}
      <div />
      {conglomerates.map((c) => (
        <ParentCard key={c.parent} name={c.parent} />
      ))}

      {/* Tier rows */}
      {tiers.map((tier, tierIndex) => (
        <Fragment key={tier.key}>
          {/* Row label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: 16,
              fontSize: 12,
              fontWeight: 500,
              color: "var(--oc-text-secondary, #4b5563)",
              textAlign: "right",
              lineHeight: 1.2,
            }}
          >
            {tier.label}
          </div>

          {/* Tier cells with connector spanning the full gap above */}
          {conglomerates.map((c) => (
            <div
              key={c.parent + tier.key}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                paddingTop: CONNECTOR_GAP,
              }}
            >
              {/* Vertical connector line spanning full gap */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: -1,
                  bottom: 0,
                  left: "50%",
                  width: 1,
                  marginLeft: -0.5,
                  background: "var(--oc-border, #d1d5db)",
                  zIndex: 0,
                }}
              />
              {/* Subsidiary card */}
              <div
                style={{
                  position: "relative",
                  padding: "12px 14px",
                  background: "var(--oc-surface, #ffffff)",
                  border: "1px solid var(--oc-border, #e5e7eb)",
                  borderLeft: `3px solid ${tier.accent}`,
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--oc-text, #111827)",
                  textAlign: "left",
                  boxShadow: "0 1px 0 rgba(15, 23, 42, 0.03)",
                  zIndex: 1,
                }}
              >
                {c[tier.key]}
              </div>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function MobileLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {conglomerates.map((c) => (
        <div key={c.parent}>
          <ParentCard name={c.parent} />
          {tiers.map((tier) => (
            <div
              key={tier.key}
              style={{
                position: "relative",
                paddingTop: CONNECTOR_GAP,
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: -1,
                  bottom: 0,
                  left: "50%",
                  width: 1,
                  marginLeft: -0.5,
                  background: "var(--oc-border, #d1d5db)",
                  zIndex: 0,
                }}
              />
              <div
                style={{
                  position: "relative",
                  padding: "10px 12px",
                  background: "var(--oc-surface, #ffffff)",
                  border: "1px solid var(--oc-border, #e5e7eb)",
                  borderLeft: `3px solid ${tier.accent}`,
                  borderRadius: 6,
                  boxShadow: "0 1px 0 rgba(15, 23, 42, 0.03)",
                  zIndex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--oc-text-faint, #94a3b8)",
                  }}
                >
                  {tier.label}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--oc-text, #111827)",
                  }}
                >
                  {c[tier.key]}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ParentCard({ name }: { name: string }) {
  return (
    <div
      style={{
        padding: "16px 16px 18px",
        background: "var(--oc-surface, #ffffff)",
        border: "1px solid var(--oc-border, #e5e7eb)",
        borderRadius: 8,
        boxShadow: "0 1px 0 rgba(15, 23, 42, 0.04)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--oc-text-faint, #94a3b8)",
          marginBottom: 6,
        }}
      >
        Parent company
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: "var(--oc-text, #111827)",
        }}
      >
        {name}
      </div>
    </div>
  );
}
