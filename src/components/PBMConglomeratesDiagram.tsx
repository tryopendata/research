import { Fragment } from "react";

type Tier = {
  key: "parent" | "insurer" | "pbm" | "pharmacy";
  label: string;
  color: string;
};

const columns = [
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
  { key: "parent", label: "Parent company", color: "#c44e52" },
  { key: "insurer", label: "Insurer", color: "#e09c41" },
  { key: "pbm", label: "Pharmacy Benefit Manager", color: "#4a7ab5" },
  { key: "pharmacy", label: "Pharmacy", color: "#6a9f58" },
];

export function PBMConglomeratesDiagram() {
  return (
    <div style={{ padding: "24px 16px", fontFamily: "inherit" }}>
      <div
        style={{
          textAlign: "center",
          marginBottom: 4,
          fontSize: 18,
          fontWeight: 600,
          color: "var(--oc-text, #1f2937)",
        }}
      >
        Three conglomerates own the insurer, PBM, and pharmacy
      </div>
      <div
        style={{
          textAlign: "center",
          marginBottom: 20,
          fontSize: 13,
          color: "var(--oc-text-muted, #6b7280)",
        }}
      >
        The Big 3 PBMs control ~80% of US prescription claims, covering 270 million people
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px repeat(3, 1fr)",
          gap: 0,
          alignItems: "stretch",
        }}
      >
        <div />
        {columns.map((c, i) => (
          <div
            key={c.parent}
            style={{
              textAlign: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--oc-text-muted, #6b7280)",
              letterSpacing: 0.6,
              textTransform: "uppercase",
              paddingBottom: 8,
            }}
          >
            Conglomerate {i + 1}
          </div>
        ))}
        {tiers.map((tier, tierIdx) => (
          <Fragment key={tier.key}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 14,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--oc-text, #374151)",
                borderRight: "1px solid var(--oc-border, #e5e7eb)",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: tier.color,
                  marginRight: 8,
                  flexShrink: 0,
                }}
              />
              <span style={{ textAlign: "right" }}>{tier.label}</span>
            </div>
            {columns.map((c) => (
              <div
                key={c.parent + tier.key}
                style={{
                  position: "relative",
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {tierIdx > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: -1,
                      left: "50%",
                      width: 2,
                      height: 12,
                      background: "var(--oc-border, #cbd5e1)",
                      transform: "translateX(-50%)",
                    }}
                  />
                )}
                <div
                  style={{
                    width: "100%",
                    maxWidth: 220,
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: tier.color,
                    color: "#fff",
                    textAlign: "center",
                    fontSize: 13,
                    fontWeight: 600,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                  }}
                >
                  {c[tier.key]}
                </div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      <div
        style={{
          marginTop: 20,
          fontSize: 11,
          color: "var(--oc-text-muted, #6b7280)",
          borderTop: "1px solid var(--oc-border, #e5e7eb)",
          paddingTop: 8,
        }}
      >
        Source: FTC Second Interim Staff Report on PBMs (January 2025), Drug Channels (March 2025)
      </div>
    </div>
  );
}
