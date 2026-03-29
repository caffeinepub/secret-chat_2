import { useCallback, useState } from "react";

const SECRET_PIN = "9696";

interface Props {
  onUnlock: () => void;
}

type CalcBtn = {
  label: string;
  type: "digit" | "op" | "eq" | "clear" | "special";
  wide?: boolean;
};

const BUTTONS: CalcBtn[][] = [
  [
    { label: "AC", type: "clear" },
    { label: "+/-", type: "special" },
    { label: "%", type: "special" },
    { label: "\u00f7", type: "op" },
  ],
  [
    { label: "7", type: "digit" },
    { label: "8", type: "digit" },
    { label: "9", type: "digit" },
    { label: "\u00d7", type: "op" },
  ],
  [
    { label: "4", type: "digit" },
    { label: "5", type: "digit" },
    { label: "6", type: "digit" },
    { label: "\u2212", type: "op" },
  ],
  [
    { label: "1", type: "digit" },
    { label: "2", type: "digit" },
    { label: "3", type: "digit" },
    { label: "+", type: "op" },
  ],
  [
    { label: "0", type: "digit", wide: true },
    { label: ".", type: "special" },
    { label: "=", type: "eq" },
  ],
];

const ROW_KEYS = ["row-top", "row-789", "row-456", "row-123", "row-0"];

export default function Calculator({ onUnlock }: Props) {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [justEvaled, setJustEvaled] = useState(false);
  const [pinBuffer, setPinBuffer] = useState("");

  const handleButton = useCallback(
    (btn: CalcBtn) => {
      if (btn.type === "clear") {
        setDisplay("0");
        setExpression("");
        setJustEvaled(false);
        setPinBuffer("");
        return;
      }

      if (btn.type === "digit") {
        const newPin = `${pinBuffer}${btn.label}`.slice(-4);
        setPinBuffer(newPin);

        if (justEvaled) {
          setDisplay(btn.label);
          setExpression("");
          setJustEvaled(false);
        } else {
          setDisplay((prev) =>
            prev === "0" ? btn.label : `${prev}${btn.label}`,
          );
        }
        return;
      }

      if (btn.type === "eq") {
        if (pinBuffer === SECRET_PIN) {
          setPinBuffer("");
          onUnlock();
          return;
        }
        try {
          const expr = `${expression}${display}`
            .replace(/\u00f7/g, "/")
            .replace(/\u00d7/g, "*")
            .replace(/\u2212/g, "-");
          const result = Function(`"use strict"; return (${expr})`)() as number;
          const resultStr = Number.isFinite(result)
            ? Number.parseFloat(result.toPrecision(10)).toString()
            : "Error";
          setDisplay(resultStr);
          setExpression("");
          setJustEvaled(true);
          setPinBuffer("");
        } catch {
          setDisplay("Error");
          setExpression("");
          setJustEvaled(true);
          setPinBuffer("");
        }
        return;
      }

      if (btn.type === "op") {
        setPinBuffer("");
        setExpression(`${expression}${display} ${btn.label} `);
        setDisplay("0");
        setJustEvaled(false);
        return;
      }

      if (btn.type === "special") {
        setPinBuffer("");
        if (btn.label === ".") {
          if (!display.includes(".")) {
            setDisplay((prev) => `${prev}.`);
          }
        } else if (btn.label === "%") {
          const val = Number.parseFloat(display) / 100;
          setDisplay(val.toString());
        } else if (btn.label === "+/-") {
          setDisplay((prev) =>
            prev.startsWith("-") ? prev.slice(1) : `-${prev}`,
          );
        }
      }
    },
    [display, expression, justEvaled, pinBuffer, onUnlock],
  );

  const btnClass = (btn: CalcBtn) => {
    const base =
      "flex items-center justify-center rounded-full text-xl font-medium transition-opacity active:opacity-60 select-none cursor-pointer";
    if (btn.type === "eq") return `${base} bg-btn-eq text-background`;
    if (btn.type === "clear" || btn.type === "special")
      return `${base} bg-btn-clear text-foreground`;
    if (btn.type === "op") return `${base} bg-btn-op text-primary`;
    return `${base} bg-btn-digit text-foreground`;
  };

  return (
    <div
      className="w-full max-w-[360px] min-h-screen flex flex-col justify-end pb-4 px-4"
      style={{ background: "oklch(0.1 0 0)" }}
    >
      {/* Display */}
      <div className="px-2 pb-4 pt-16 text-right">
        <div className="text-muted-foreground text-sm h-6 truncate">
          {expression}
        </div>
        <div
          className="text-foreground font-mono leading-none mt-1 break-all"
          style={{
            fontSize:
              display.length > 10
                ? "2.5rem"
                : display.length > 7
                  ? "3.5rem"
                  : "5rem",
          }}
        >
          {display}
        </div>
      </div>

      {/* Buttons */}
      <div className="grid gap-3">
        {BUTTONS.map((row, ri) => (
          <div key={ROW_KEYS[ri]} className="grid grid-cols-4 gap-3">
            {row.map((btn) => (
              <button
                type="button"
                key={btn.label}
                data-ocid={`calc.${btn.label === "=" ? "eq_button" : btn.label === "AC" ? "clear_button" : "button"}`}
                className={`${btnClass(btn)} ${
                  btn.wide
                    ? "col-span-2 rounded-[2rem] pl-8 justify-start"
                    : "aspect-square"
                }`}
                onClick={() => handleButton(btn)}
                style={{ height: btn.wide ? undefined : "4.5rem" }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
