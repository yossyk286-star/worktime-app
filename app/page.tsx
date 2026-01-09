
"use client";
import { useEffect, useMemo, useRef, useCallback, useState } from "react";

/* ========= 入力整形ユーティリティ ========= */
function cleanInput(value: string): string {
  return value.replace(/[０-９：]/g, "").replace(/[^\d:]/g, "");
}

function formatOnBlur(value: string): string {
  const s = cleanInput(value);
  if (s.includes(":")) {
    const [hRaw = "", mRaw = "", sRaw = ""] = s.split(":");
    const h = hRaw.padStart(2, "0").slice(-2);
    const m = mRaw.padStart(2, "0").slice(0, 2);
    if (sRaw) {
      const ss = sRaw.padStart(2, "0").slice(0, 2);
      return `${h}:${m}:${ss}`;
    }
    return `${h}:${m}`;
  } else {
    if (s.length === 3) {
      const h = s.slice(0, 1).padStart(2, "0");
      const m = s.slice(1, 3);
      return `${h}:${m}`;
    } else if (s.length >= 4) {
      const h = s.slice(0, 2);
      const m = s.slice(2, 4);
      const ss = s.length >= 6 ? s.slice(4, 6) : "";
      return ss ? `${h}:${m}:${ss}` : `${h}:${m}`;
    }
    return s;
  }
}

function parseTimeStr(value: string): { h: number; m: number; s: number } | null {
  if (/[０-９：]/.test(value)) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = match[3] ? parseInt(match[3], 10) : 0;
  if ([h, m, s].some((x) => Number.isNaN(x))) return null;
  if (m < 0 || m > 59 || s < 0 || s > 59) return null;
  return { h, m, s };
}

function toTotalSeconds(t: { h: number; m: number; s: number }): number {
  return t.h * 3600 + t.m * 60 + t.s;
}

function formatHhMmFromSeconds(sec: number): { label: string; nextDay: boolean } {
  const nextDay = sec >= 24 * 3600;
  const s = sec % (24 * 3600);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return { label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, nextDay };
}

/* ========= 現在時刻ベースの残り／経過 ========= */
function getRemainingToPreview(preview: { label: string; nextDay: boolean }) {
  const [hh, mm] = preview.label.split(":").map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (preview.nextDay) target.setDate(target.getDate() + 1);
  let diffMs = target.getTime() - now.getTime();
  const passed = diffMs < 0 && !preview.nextDay;
  if (diffMs <= 0) return { h: 0, m: 0, passed };
  const totalMinutes = Math.ceil(diffMs / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return { h, m, passed };
}

function getElapsedFromStart(start: { h: number; m: number; s: number } | null) {
  if (!start) return { h: 0, m: 0 };
  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(start.h, start.m, start.s, 0);
  let diffMs = now.getTime() - startDate.getTime();
  if (diffMs <= 0) return { h: 0, m: 0 };
  const totalMinutes = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return { h, m };
}

/* ========= フォーマッタ／丸め ========= */
function formatHoursByMode(hours: number, mode: "ceil" | "floor") {
  const v = mode === "ceil" ? Math.ceil(hours * 100) / 100 : Math.floor(hours * 100) / 100;
  return v.toFixed(2);
}
function formatMinutesByMode(minutes: number, mode: "ceil" | "floor") {
  const v = mode === "ceil" ? Math.ceil(minutes) : Math.floor(minutes);
  return String(v);
}
function roundToQuarter(minutes: number, mode: "off" | "floor" | "ceil") {
  if (mode === "off") return minutes;
  const q = minutes / 15;
  const rounded = mode === "ceil" ? Math.ceil(q) : Math.floor(q);
  return rounded * 15;
}

/* ========= 型 ========= */
type TargetPreset = "4h" | "6h" | "7h" | "7_5h" | "8h" | "9h" | "custom";

export default function Page() {
  /* 入力 */
  const [startText, setStartText] = useState("09:00");
  const [endText, setEndText] = useState("17:30");
  const [breakText, setBreakText] = useState("01:00");
  const [overnight, setOvernight] = useState(false);

  /* 目標 */
  const [targetPreset, setTargetPreset] = useState<TargetPreset>("8h");
  const [targetH, setTargetH] = useState(8);
  const [targetM, setTargetM] = useState(0);

  /* プレビュー設定 */
  const [includeBreakInTarget, setIncludeBreakInTarget] = useState(true);

  /* 確定値 */
  const [confirmedStart, setConfirmedStart] = useState<{ h: number; m: number; s: number } | null>(null);
  const [confirmedEnd, setConfirmedEnd] = useState<{ h: number; m: number; s: number } | null>(null);
  const [confirmedBreakSec, setConfirmedBreakSec] = useState<number | null>(null);
  const [confirmedOvernight, setConfirmedOvernight] = useState(false);

  /* コピー状態 */
  const [copiedHour, setCopiedHour] = useState(false);
  const [copiedMinute, setCopiedMinute] = useState(false);
  const [copiedGrossHour, setCopiedGrossHour] = useState(false);
  const [copiedGrossMinute, setCopiedGrossMinute] = useState(false);

  /* エラー */
  const [error, setError] = useState("");

  /* 丸めモード */
  const [hoursRounding, setHoursRounding] = useState<"ceil" | "floor">("floor");
  const [minutesRounding, setMinutesRounding] = useState<"ceil" | "floor">("floor");
  const [quarterMode, setQuarterMode] = useState<"off" | "floor" | "ceil">("off");

  /* 自動更新（1分） */
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    const startAlignedInterval = () => {
      const now = new Date();
      const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      const timeoutId = window.setTimeout(() => {
        setNowTick(Date.now());
        intervalRef.current = window.setInterval(() => setNowTick(Date.now()), 60_000);
      }, msToNextMinute);
      return timeoutId;
    };
    const timeoutId = startAlignedInterval();
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  /* プリセット反映 */
  useEffect(() => {
    switch (targetPreset) {
      case "4h": setTargetH(4); setTargetM(0); break;
      case "6h": setTargetH(6); setTargetM(0); break;
      case "7h": setTargetH(7); setTargetM(0); break;
      case "7_5h": setTargetH(7); setTargetM(30); break;
      case "8h": setTargetH(8); setTargetM(0); break;
      case "9h": setTargetH(9); setTargetM(0); break;
      case "custom": break;
    }
  }, [targetPreset]);

  /* 入力ハンドラ */
  const onStartChange = useCallback((raw: string) => setStartText(cleanInput(raw)), []);
  const onStartBlur   = useCallback((raw: string) => setStartText(formatOnBlur(raw)), []);
  const onEndChange   = useCallback((raw: string) => setEndText(cleanInput(raw)), []);
  const onEndBlur     = useCallback((raw: string) => setEndText(formatOnBlur(raw)), []);
  const onBreakChange = useCallback((raw: string) => setBreakText(cleanInput(raw)), []);
  const onBreakBlur   = useCallback((raw: string) => setBreakText(formatOnBlur(raw)), []);

  /* 整形文字列 */
  const normalizedStart = useMemo(() => formatOnBlur(startText), [startText]);
  const normalizedEnd   = useMemo(() => formatOnBlur(endText), [endText]);
  const normalizedBreak = useMemo(() => formatOnBlur(breakText), [breakText]);

  /* パース */
  const parsedStart = useMemo(() => parseTimeStr(normalizedStart), [normalizedStart]);
  const parsedEnd   = useMemo(() => parseTimeStr(normalizedEnd), [normalizedEnd]);
  const parsedBreak = useMemo(() => parseTimeStr(normalizedBreak), [normalizedBreak]);

  /* 確定 */
  const onConfirm = useCallback(() => {
    const s = parsedStart, e = parsedEnd, b = parsedBreak;
    if (!s || !e || !b) {
      setError("入力形式が正しくありません。（例：0800 → 08:00）");
      return;
    }
    const sSec = toTotalSeconds(s);
    let eSec = toTotalSeconds(e);
    const bSec = toTotalSeconds(b);
    if (overnight) eSec += 24 * 3600;
    if (eSec < sSec) {
      setError("終業時間が始業時間より前です。「翌日またぎ」をオンにしてください。");
      return;
    }
    const net = eSec - sSec - bSec;
    if (net < 0) {
      setError("休憩時間が長すぎます。");
      return;
    }
    setError("");
    setConfirmedStart(s);
    setConfirmedEnd(e);
    setConfirmedBreakSec(bSec);
    setConfirmedOvernight(overnight);
  }, [parsedStart, parsedEnd, parsedBreak, overnight]);

  const onResetConfirm = useCallback(() => {
    setConfirmedStart(null);
    setConfirmedEnd(null);
    setConfirmedBreakSec(null);
    setConfirmedOvernight(false);
    setError("");
  }, []);

  /* 計算 */
  const durationSeconds = useMemo(() => {
    if (!confirmedStart || !confirmedEnd || confirmedBreakSec == null) return null;
    let s = toTotalSeconds(confirmedStart);
    let e = toTotalSeconds(confirmedEnd);
    if (confirmedOvernight) e += 24 * 3600;
    const net = e - s - confirmedBreakSec;
    return net >= 0 ? net : null;
  }, [confirmedStart, confirmedEnd, confirmedBreakSec, confirmedOvernight]);

  const grossSeconds = useMemo(() => {
    if (!confirmedStart || !confirmedEnd) return null;
    let s = toTotalSeconds(confirmedStart);
    let e = toTotalSeconds(confirmedEnd);
    if (confirmedOvernight) e += 24 * 3600;
    const gross = e - s;
    return gross >= 0 ? gross : null;
  }, [confirmedStart, confirmedEnd, confirmedOvernight]);

  const targetSeconds = useMemo(() => targetH * 3600 + targetM * 60, [targetH, targetM]);

  /* 目標終了プレビュー */
  const previewEnd = useMemo(() => {
    if (!parsedStart || !parsedBreak) return null;
    const base = toTotalSeconds(parsedStart);
    const add = targetSeconds + (includeBreakInTarget ? toTotalSeconds(parsedBreak) : 0);
    return formatHhMmFromSeconds(base + add);
  }, [parsedStart, parsedBreak, includeBreakInTarget, targetSeconds]);

  /* 経過/残り（自動更新） */
  const baseForElapsed = useMemo(() => confirmedStart ?? parsedStart ?? null, [confirmedStart, parsedStart]);
  const timeStats = useMemo(() => {
    if (!previewEnd) return null;
    const rem = getRemainingToPreview(previewEnd);
    const el = getElapsedFromStart(baseForElapsed);
    return { rem, el };
  }, [previewEnd, baseForElapsed, nowTick]);

  /* 表示用数値 */
  const hoursDecimal        = durationSeconds == null ? null : durationSeconds / 3600;
  const minutesDecimal      = durationSeconds == null ? null : durationSeconds / 60;
  const grossHoursDecimal   = grossSeconds    == null ? null : grossSeconds    / 3600;
  const grossMinutesDecimal = grossSeconds    == null ? null : grossSeconds    / 60;

  /* 15分単位適用 */
  const minutesRounded = useMemo(() => {
    if (minutesDecimal == null) return null;
    return roundToQuarter(minutesDecimal, quarterMode);
  }, [minutesDecimal, quarterMode]);

  const grossMinutesRounded = useMemo(() => {
    if (grossMinutesDecimal == null) return null;
    return roundToQuarter(grossMinutesDecimal, quarterMode);
  }, [grossMinutesDecimal, quarterMode]);

  const hoursBase = useMemo(() => {
    if (hoursDecimal == null) return null;
    return quarterMode === "off" ? hoursDecimal : (minutesRounded! / 60);
  }, [hoursDecimal, minutesRounded, quarterMode]);

  const grossHoursBase = useMemo(() => {
    if (grossHoursDecimal == null) return null;
    return quarterMode === "off" ? grossHoursDecimal : (grossMinutesRounded! / 60);
  }, [grossHoursDecimal, grossMinutesRounded, quarterMode]);

  const remainingSec = durationSeconds == null ? null : Math.max(0, targetSeconds - durationSeconds);
  const overSec      = durationSeconds == null ? null : Math.max(0, durationSeconds - targetSeconds);

  const remainingHm = useMemo(() => {
    if (remainingSec == null) return null;
    return { h: Math.floor(remainingSec / 3600), m: Math.floor((remainingSec % 3600) / 60) };
  }, [remainingSec]);

  const overHm = useMemo(() => {
    if (overSec == null) return null;
    return { h: Math.floor(overSec / 3600), m: Math.floor((overSec % 3600) / 60) };
  }, [overSec]);

  /* クリップボード */
  const copyText = useCallback(async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("コピーに失敗しました。ブラウザの権限やHTTPS環境をご確認ください。");
    }
  }, []);

  /* カスタム目標入力 */
  const onChangeTargetH = useCallback((val: string) => {
    const n = parseInt(val, 10);
    setTargetH(Number.isNaN(n) ? 0 : Math.max(0, n));
  }, []);
  const onChangeTargetM = useCallback((val: string) => {
    const n = parseInt(val, 10);
    setTargetM(Number.isNaN(n) ? 0 : Math.max(0, Math.min(59, n)));
  }, []);

  /* ---------------- 見た目調整: 青系タブ＆カード統一 ---------------- */
  const tabGroup = "inline-flex overflow-hidden rounded-lg border border-sky-300";
  const tabBase  = "px-3 py-1 text-sm focus:outline-none";
  const tabActive = "bg-sky-600 text-white";
  const tabInactive = "bg-white text-sky-700 hover:bg-sky-50";

  return (
    <main className="min-h-screen bg-sky-50 text-slate-800">
      {/* ヘッダー */}
      <header className="bg-gradient-to-r from-sky-100 via-sky-200 to-sky-100 border-b border-sky-200">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-wide">労働時間計算くん</h1>
        </div>
      </header>

      <div className="mx-auto max-w-4xl p-6 leading-relaxed">
        {/* 入力カード */}
        <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-base font-medium">始業時間（半角）</span>
              <input
                value={startText}
                onChange={(e) => setStartText(cleanInput(e.target.value))}
                onBlur={(e) => setStartText(formatOnBlur(e.target.value))}
                placeholder="例: 08:00 / 0800"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                className="mt-2 w-full rounded-lg border border-sky-300 bg-white p-3"
              />
            </label>

            <label className="block">
              <span className="text-base font-medium">終業時間（半角）</span>
              <input
                value={endText}
                onChange={(e) => setEndText(cleanInput(e.target.value))}
                onBlur={(e) => setEndText(formatOnBlur(e.target.value))}
                placeholder="例: 17:30 / 1730"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                className="mt-2 w-full rounded-lg border border-sky-300 bg-white p-3"
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-base font-medium">休憩（半角）</span>
              <input
                value={breakText}
                onChange={(e) => setBreakText(cleanInput(e.target.value))}
                onBlur={(e) => setBreakText(formatOnBlur(e.target.value))}
                placeholder="例: 01:00 / 0100"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                className="mt-2 w-full rounded-lg border border-sky-300 bg-white p-3"
              />
            </label>

            <div>
              <label className="mt-7 flex items-center gap-3 md:mt-9">
                <input
                  type="checkbox"
                  checked={overnight}
                  onChange={(e) => setOvernight(e.target.checked)}
                  className="h-5 w-5 rounded border-sky-300 text-sky-600"
                />
                <span className="text-base font-medium">翌日またぎ</span>
              </label>
              <p className="mt-1 text-xs text-slate-500">
                ※（例：22:00→06:00）は「翌日またぎ」をオンにしてください。
              </p>
            </div>
          </div>

          {/* 目標労働時間＋休憩含めるトグル */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">目標労働時間</span>
              <select
                value={targetPreset}
                onChange={(e) => setTargetPreset(e.target.value as TargetPreset)}
                className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-sky-700"
              >
                <option value="4h">4時間</option>
                <option value="6h">6時間</option>
                <option value="7h">7時間</option>
                <option value="7_5h">7時間30分</option>
                <option value="8h">8時間</option>
                <option value="9h">9時間</option>
                <option value="custom">カスタム</option>
              </select>

              {targetPreset === "custom" && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={targetH}
                    onChange={(e) => onChangeTargetH(e.target.value)}
                    className="w-20 rounded-lg border border-sky-300 px-3 py-2"
                    aria-label="目標労働時間（時）"
                  />
                  <span>時間</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={targetM}
                    onChange={(e) => onChangeTargetM(e.target.value)}
                    className="w-20 rounded-lg border border-sky-300 px-3 py-2"
                    aria-label="目標労働時間（分）"
                  />
                  <span>分</span>
                </div>
              )}
            </div>

            <label className="ml-auto flex items-center gap-3">
              <span className="text-sm font-medium">目標終了に休憩を含める</span>
              <input
                type="checkbox"
                checked={includeBreakInTarget}
                onChange={(e) => setIncludeBreakInTarget(e.target.checked)}
                className="peer sr-only"
              />
              <span
                className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full border ${
                  includeBreakInTarget ? "border-sky-400 bg-sky-500" : "border-slate-300 bg-slate-300"
                } transition`}
              >
                <span
                  className={`absolute left-1 inline-block h-4 w-4 rounded-full bg-white shadow transition ${
                    includeBreakInTarget ? "translate-x-5" : ""
                  }`}
                />
              </span>
            </label>
          </div>

          {/* 目標終了プレビュー */}
          <div className="mt-4 space-y-2 text-sm">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              {previewEnd ? (
                <>
                  <div className="text-base font-medium">
                    目標終了時刻（始業＋目標{includeBreakInTarget ? "＋休憩" : ""}）：
                  </div>
                  <div className="mt-1 flex items-baseline gap-3">
                    <div className="text-2xl font-semibold">{previewEnd.label}</div>
                    <div className="text-sm text-slate-600">
                      {timeStats && (
                        <>
                          （現在時刻から残り{" "}
                          <span className="font-mono">{timeStats.rem.h}</span> 時間{" "}
                          <span className="font-mono">{String(timeStats.rem.m).padStart(2, "0")}</span> 分 ／ 経過{" "}
                          <span className="font-mono">{timeStats.el.h}</span> 時間{" "}
                          <span className="font-mono">{String(timeStats.el.m).padStart(2, "0")}</span> 分）
                          {timeStats.rem.passed && <span className="ml-1">※目標時刻を過ぎています</span>}
                        </>
                      )}
                    </div>
                    {previewEnd.nextDay && <span className="text-sm">（翌日）</span>}
                  </div>
                </>
              ) : (
                <span>始業・休憩の入力で目標終了時刻を表示します。</span>
              )}
            </div>
          </div>

          {/* 確定・解除 */}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg bg-sky-600 px-5 py-2.5 font-medium text-white shadow-sm hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              計算を確定
            </button>
            <button
              type="button"
              onClick={onResetConfirm}
              className="rounded-lg border border-sky-300 bg-white px-5 py-2.5 font-medium text-slate-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              確定の解除
            </button>
          </div>

          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        </div>

        {/* ====== 結果（青系タブに統一） ====== */}
        {durationSeconds != null && (
          <section className="mt-6 grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">結果</h2>

                <div className="flex flex-wrap items-center gap-4">
                  {/* 時間の丸めタブ（青統一） */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-700">時間の丸め</span>
                    <div className={tabGroup}>
                      <button
                        type="button"
                        onClick={() => setHoursRounding("floor")}
                        className={`${tabBase} ${hoursRounding === "floor" ? tabActive : tabInactive}`}
                        aria-label="時間を少数第3位で切り捨て"
                      >
                        切捨
                      </button>
                      <button
                        type="button"
                        onClick={() => setHoursRounding("ceil")}
                        className={`${tabBase} border-l border-sky-300 ${hoursRounding === "ceil" ? tabActive : tabInactive}`}
                        aria-label="時間を少数第3位で切り上げ"
                      >
                        切上
                      </button>
                    </div>
                  </div>

                  {/* 分の丸めタブ（青統一）— 15分単位オン時は見た目グレー */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-700">分の丸め</span>
                    <div
                      className={`${tabGroup} ${quarterMode !== "off" ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => setMinutesRounding("floor")}
                        className={`${tabBase} ${minutesRounding === "floor" ? tabActive : tabInactive}`}
                        aria-label="分を少数第1位で切り捨て"
                      >
                        切捨
                      </button>
                      <button
                        type="button"
                        onClick={() => setMinutesRounding("ceil")}
                        className={`${tabBase} border-l border-sky-300 ${minutesRounding === "ceil" ? tabActive : tabInactive}`}
                        aria-label="分を少数第1位で切り上げ"
                      >
                        切上
                      </button>
                    </div>
                  </div>

                  {/* 15分単位タブ（青統一） */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-700">15分単位</span>
                    <div className={tabGroup}>
                      <button
                        type="button"
                        onClick={() => setQuarterMode("off")}
                        className={`${tabBase} ${quarterMode === "off" ? tabActive : tabInactive}`}
                        aria-label="15分単位をオフ"
                      >
                        オフ
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuarterMode("floor")}
                        className={`${tabBase} border-l border-sky-300 ${quarterMode === "floor" ? tabActive : tabInactive}`}
                        aria-label="15分単位で切り捨て"
                      >
                        切捨
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuarterMode("ceil")}
                        className={`${tabBase} border-l border-sky-300 ${quarterMode === "ceil" ? tabActive : tabInactive}`}
                        aria-label="15分単位で切り上げ"
                      >
                        切上
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 正味（休憩差引） */}
              <div className="mt-4 space-y-5">
                {/* 時間（休憩を除く） */}
                <div>
                  <div className="flex items-center justify-between">
                    <span>時間（休憩を除く）</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={hoursBase == null}
                        onClick={() =>
                          hoursBase != null &&
                          copyText(formatHoursByMode(hoursBase, hoursRounding), setCopiedHour)
                        }
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                          hoursBase != null ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        数字をコピー
                      </button>
                      {copiedHour && <span className="text-xs text-emerald-700">コピーしました</span>}
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <div className="text-xl font-semibold">
                      <strong className="font-mono">
                        {hoursBase != null ? formatHoursByMode(hoursBase, hoursRounding) : "--"}
                      </strong>{" "}
                      時間
                    </div>
                  </div>
                </div>

                {/* 分（休憩を除く） */}
                <div>
                  <div className="flex items-center justify-between">
                    <span>分（休憩を除く）</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={(quarterMode === "off" ? minutesDecimal == null : minutesRounded == null)}
                        onClick={() => {
                          if (quarterMode === "off" && minutesDecimal != null) {
                            copyText(formatMinutesByMode(minutesDecimal, minutesRounding), setCopiedMinute);
                          } else if (minutesRounded != null) {
                            copyText(String(Math.round(minutesRounded)), setCopiedMinute);
                          }
                        }}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                          (quarterMode === "off" ? minutesDecimal != null : minutesRounded != null)
                            ? "bg-sky-600 text-white"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        数字をコピー
                      </button>
                      {copiedMinute && <span className="text-xs text-emerald-700">コピーしました</span>}
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <div className="text-xl font-semibold">
                      <strong className="font-mono">
                        {quarterMode === "off"
                          ? (minutesDecimal != null ? formatMinutesByMode(minutesDecimal, minutesRounding) : "--")
                          : (minutesRounded != null ? String(Math.round(minutesRounded)) : "--")}
                      </strong>{" "}
                      分
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ==== 休憩を含む（総経過）— デザインを上と統一 ==== */}
            <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
              {/* タイトル行は上カードと同じ構成 */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">休憩を含む</h2>
              </div>

              <div className="mt-4 space-y-5">
                {/* 時間（休憩を含む） */}
                <div>
                  <div className="flex items-center justify-between">
                    <span>時間（休憩を含む）</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={grossHoursBase == null}
                        onClick={() =>
                          grossHoursBase != null &&
                          copyText(formatHoursByMode(grossHoursBase, hoursRounding), setCopiedGrossHour)
                        }
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                          grossHoursBase != null ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        数字をコピー
                      </button>
                      {copiedGrossHour && <span className="text-xs text-emerald-700">コピーしました</span>}
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <div className="text-xl font-semibold">
                      <strong className="font-mono">
                        {grossHoursBase != null ? formatHoursByMode(grossHoursBase, hoursRounding) : "--"}
                      </strong>{" "}
                      時間
                    </div>
                  </div>
                </div>

                {/* 分（休憩を含む） */}
                <div>
                  <div className="flex items-center justify-between">
                    <span>分（休憩を含む）</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={(quarterMode === "off" ? grossMinutesDecimal == null : grossMinutesRounded == null)}
                        onClick={() => {
                          if (quarterMode === "off" && grossMinutesDecimal != null) {
                            copyText(formatMinutesByMode(grossMinutesDecimal, minutesRounding), setCopiedGrossMinute);
                          } else if (grossMinutesRounded != null) {
                            copyText(String(Math.round(grossMinutesRounded)), setCopiedGrossMinute);
                          }
                        }}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                          (quarterMode === "off" ? grossMinutesDecimal != null : grossMinutesRounded != null)
                            ? "bg-sky-600 text-white"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        数字をコピー
                      </button>
                      {copiedGrossMinute && <span className="text-xs text-emerald-700">コピーしました</span>}
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <div className="text-xl font-semibold">
                      <strong className="font-mono">
                        {quarterMode === "off"
                          ? (grossMinutesDecimal != null ? formatMinutesByMode(grossMinutesDecimal, minutesRounding) : "--")
                          : (grossMinutesRounded != null ? String(Math.round(grossMinutesRounded)) : "--")}
                      </strong>{" "}
                      分
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 目標までの残り／超過 */}
            <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">目標までの残り／超過</h2>
              <div className="mt-3 space-y-2">
                {remainingSec === 0 && overSec === 0 ? (
                  <p className="font-semibold text-emerald-700">到達（±0分）</p>
                ) : (remainingSec! > 0) ? (
                  <p className="font-semibold">
                    目標労働時間 {targetH}時間{String(targetM).padStart(2, "0")}分 にはあと{" "}
                    <span className="font-mono">{remainingHm!.h}</span> 時間{" "}
                    <span className="font-mono">{String(remainingHm!.m).padStart(2, "0")}</span> 分必要です。
                  </p>
                ) : (
                  <p className="font-semibold">
                    目標労働時間 {targetH}時間{String(targetM).padStart(2, "0")}分 を{" "}
                    <span className="font-mono">{overHm!.h}</span> 時間{" "}
                    <span className="font-mono">{String(overHm!.m).padStart(2, "0")}</span> 分超過しています。
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
``
