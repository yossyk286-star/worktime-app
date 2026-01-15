
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
  const diffMs = target.getTime() - now.getTime();
  const passed = diffMs < 0 && !preview.nextDay;
  if (diffMs <= 0) return { h: 0, m: 0, passed };
  const totalMinutes = Math.ceil(diffMs / 60000);
  return { h: Math.floor(totalMinutes / 60), m: totalMinutes % 60, passed };
}
function getElapsedFromStart(start: { h: number; m: number; s: number } | null) {
  if (!start) return { h: 0, m: 0 };
  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(start.h, start.m, start.s, 0);
  const diffMs = now.getTime() - startDate.getTime();
  if (diffMs <= 0) return { h: 0, m: 0 };
  const totalMinutes = Math.floor(diffMs / 60000);
  return { h: Math.floor(totalMinutes / 60), m: totalMinutes % 60 };
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
type BreakPreset = "00:00" | "00:30" | "00:45" | "01:00" | "01:30" | "02:00" | "custom";
const BREAK_PRESET_SECONDS: Record<Exclude<BreakPreset, "custom">, number> = {
  "00:00": 0, "00:30": 1800, "00:45": 2700, "01:00": 3600, "01:30": 5400, "02:00": 7200,
};

export default function Page() {
  /* 入力 */
  const [startText, setStartText] = useState("09:00");
  const [endText, setEndText] = useState("17:30");
  const [breakPreset, setBreakPreset] = useState<BreakPreset>("01:00");
  const [customBreakText, setCustomBreakText] = useState("01:00");
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

  /* コピー／エラー／丸めモード */
  const [copiedHour, setCopiedHour] = useState(false);
  const [copiedMinute, setCopiedMinute] = useState(false);
  const [copiedGrossHour, setCopiedGrossHour] = useState(false);
  const [copiedGrossMinute, setCopiedGrossMinute] = useState(false);
  const [error, setError] = useState("");
  const [hoursRounding, setHoursRounding] = useState<"ceil" | "floor">("floor");
  const [minutesRounding, setMinutesRounding] = useState<"ceil" | "floor">("floor");
  const [quarterMode, setQuarterMode] = useState<"off" | "floor" | "ceil">("off");

  /* ===== 毎分 00 秒に合わせて更新 ===== */
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

  /* 目標プリセット反映 */
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

  /* 整形文字列／パース */
  const normalizedStart = useMemo(() => formatOnBlur(startText), [startText]);
  const normalizedEnd   = useMemo(() => formatOnBlur(endText),   [endText]);
  const normalizedBreak = useMemo(() => formatOnBlur(customBreakText), [customBreakText]);

  const parsedStart = useMemo(() => parseTimeStr(normalizedStart), [normalizedStart]);
  const parsedEnd   = useMemo(() => parseTimeStr(normalizedEnd),   [normalizedEnd]);
  const parsedBreak = useMemo(() => parseTimeStr(normalizedBreak), [normalizedBreak]);

  /* 確定 */
  const onConfirm = useCallback(() => {
    const s = parsedStart, e = parsedEnd;
    const bSec =
      breakPreset === "custom"
        ? (() => {
            const b = parsedBreak;
            if (!b) { setError("休憩の入力形式が正しくありません。（例：0100 → 01:00）"); return null; }
            return toTotalSeconds(b);
          })()
        : BREAK_PRESET_SECONDS[breakPreset as Exclude<BreakPreset, "custom">];

    if (!s || !e || bSec == null) { setError("入力形式が正しくありません。（例：0800 → 08:00）"); return; }
    const sSec = toTotalSeconds(s);
    let eSec = toTotalSeconds(e);
    if (overnight) eSec += 24 * 3600;
    if (eSec < sSec) { setError("終業時間が始業時間より前です。「翌日またぎ」をオンにしてください。"); return; }
    const net = eSec - sSec - bSec;
    if (net < 0) { setError("休憩時間が長すぎます。"); return; }

    setError("");
    setConfirmedStart(s);
    setConfirmedEnd(e);
    setConfirmedBreakSec(bSec);
    setConfirmedOvernight(overnight);
  }, [parsedStart, parsedEnd, parsedBreak, overnight, breakPreset]);

  const onResetConfirm = useCallback(() => {
    setConfirmedStart(null);
    setConfirmedEnd(null);
    setConfirmedBreakSec(null);
    setConfirmedOvernight(false);
    setError("");
  }, []);

  /* 計算（確定後） */
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

  /* 目標終了プレビュー（始業＋目標（＋休憩）） */
  const previewEnd = useMemo(() => {
    if (!parsedStart) return null;
    const base = toTotalSeconds(parsedStart);
    const breakSec =
      breakPreset === "custom"
        ? (parsedBreak ? toTotalSeconds(parsedBreak) : 0)
        : BREAK_PRESET_SECONDS[breakPreset as Exclude<BreakPreset, "custom">];
    const add = targetSeconds + (includeBreakInTarget ? breakSec : 0);
    return formatHhMmFromSeconds(base + add);
  }, [parsedStart, parsedBreak, includeBreakInTarget, targetSeconds, breakPreset]);

  /* 経過/残り（毎分 00 秒の nowTick で再計算） */
  const baseForElapsed = useMemo(() => confirmedStart ?? parsedStart ?? null, [confirmedStart, parsedStart]);
  const timeStats = useMemo(() => {
    // プレビューがない場合でも「経過」だけは出すため、条件を緩める
    const el = getElapsedFromStart(baseForElapsed);
    const rem = previewEnd ? getRemainingToPreview(previewEnd) : { h: 0, m: 0, passed: false };
    return { rem, el };
  }, [previewEnd, baseForElapsed, nowTick]);

  /* 表示用数値 */
  const hoursDecimal        = durationSeconds == null ? null : durationSeconds / 3600;
  const minutesDecimal      = durationSeconds == null ? null : durationSeconds / 60;
  const grossHoursDecimal   = grossSeconds    == null ? null : grossSeconds    / 3600;
  const grossMinutesDecimal = grossSeconds    == null ? null : grossSeconds    / 60;

  /* 15分単位適用 */
  const minutesRounded      = useMemo(() => minutesDecimal      == null ? null : roundToQuarter(minutesDecimal,      quarterMode), [minutesDecimal,      quarterMode]);
  const grossMinutesRounded = useMemo(() => grossMinutesDecimal == null ? null : roundToQuarter(grossMinutesDecimal, quarterMode), [grossMinutesDecimal, quarterMode]);

  const hoursBase      = useMemo(() => hoursDecimal      == null ? null : (quarterMode === "off" ? hoursDecimal      : (minutesRounded!      / 60)), [hoursDecimal,      minutesRounded,      quarterMode]);
  const grossHoursBase = useMemo(() => grossHoursDecimal == null ? null : (quarterMode === "off" ? grossHoursDecimal : (grossMinutesRounded! / 60)), [grossHoursDecimal, grossMinutesRounded, quarterMode]);

  /* 目標までの残り／超過（確定後カードのため） */
  const remainingSec = useMemo(() => {
    if (durationSeconds == null) return null;
    return Math.max(0, targetSeconds - durationSeconds);
  }, [durationSeconds, targetSeconds]);
  const overSec = useMemo(() => {
    if (durationSeconds == null) return null;
    return Math.max(0, durationSeconds - targetSeconds);
  }, [durationSeconds, targetSeconds]);

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
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("コピーに失敗しました。ブラウザの権限や HTTPS環境をご確認ください。"); }
  }, []);

  /* タブ共通（見た目） */
  const tabGroup   = "inline-flex overflow-hidden rounded-lg border border-sky-300";
  const tabBase    = "px-3 py-1 text-sm focus:outline-none";
  const tabActive  = "bg-sky-600 text-white";
  const tabInactive= "bg-white text-sky-700 hover:bg-sky-50";

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
                inputMode="numeric" autoComplete="off" enterKeyHint="done"
                className="mt-2 w-full rounded-lg border border-sky-300 bg-white p-3 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-500"
              />
            </label>
            <label className="block">
              <span className="text-base font-medium">終業時間（半角）</span>
              <input
                value={endText}
                onChange={(e) => setEndText(cleanInput(e.target.value))}
                onBlur={(e) => setEndText(formatOnBlur(e.target.value))}
                placeholder="例: 17:30 / 1730"
                inputMode="numeric" autoComplete="off" enterKeyHint="done"
                className="mt-2 w-full rounded-lg border border-sky-300 bg-white p-3 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-500"
              />
            </label>
          </div>

          {/* 休憩：セレクト */}
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-base font-medium">休憩</span>
              <select
                value={breakPreset}
                onChange={(e) => setBreakPreset(e.target.value as BreakPreset)}
                className="
                  mt-2 w-full rounded-lg border border-sky-300 bg-white p-3 pr-10
                  text-base text-slate-800 shadow-sm appearance-none
                  focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-500
                  hover:border-sky-400 select-chevron-blue custom-select
                "
              >
                <option value="00:00">なし（00:00）</option>
                <option value="00:30">30分（00:30）</option>
                <option value="00:45">45分（00:45）</option>
                <option value="01:00">1時間（01:00）</option>
                <option value="01:30">1時間30分（01:30）</option>
                <option value="02:00">2時間（02:00）</option>
                <option value="custom">カスタム</option>
              </select>

              {breakPreset === "custom" && (
                <input
                  value={customBreakText}
                  onChange={(e) => setCustomBreakText(cleanInput(e.target.value))}
                  onBlur={(e) => setCustomBreakText(formatOnBlur(e.target.value))}
                  placeholder="例: 01:00 / 0100"
                  inputMode="numeric" autoComplete="off" enterKeyHint="done"
                  className="mt-2 w-full rounded-lg border border-sky-300 bg-white p-3 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-500"
                />
              )}
            </label>

            <div>
              <label className="mt-7 flex items-center gap-3 md:mt-9">
                <input type="checkbox" checked={overnight} onChange={(e) => setOvernight(e.target.checked)} className="h-5 w-5 rounded border-sky-300 text-sky-600" />
                <span className="text-base font-medium">翌日またぎ</span>
              </label>
              <p className="mt-1 text-xs text-slate-500">※（例：22:00→06:00）は「翌日またぎ」をオンにしてください。</p>
            </div>
          </div>

          {/* 目標労働時間＋トグル */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex w-full max-w-md flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row sm:items-center">
              <span className="text-sm font-medium">目標労働時間</span>
              <select
                value={targetPreset}
                onChange={(e) => setTargetPreset(e.target.value as TargetPreset)}
                className="
                  w-full sm:w-auto rounded-lg border border-sky-300 bg-white p-3 pr-10
                  text-base text-slate-800 shadow-sm appearance-none
                  focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-500
                  hover:border-sky-400 select-chevron-blue custom-select
                "
                aria-label="目標労働時間プリセット"
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
                    type="number" min={0} value={targetH}
                    onChange={(e) => setTargetH(parseInt(e.target.value || "0", 10))}
                    className="w-20 rounded-lg border border-sky-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-500"
                    aria-label="目標労働時間（時）"
                  />
                  <span>時間</span>
                  <input
                    type="number" min={0} max={59} value={targetM}
                    onChange={(e) => setTargetM(Math.min(59, parseInt(e.target.value || "0", 10)))}
                    className="w-20 rounded-lg border border-sky-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-500"
                    aria-label="目標労働時間（分）"
                  />
                  <span>分</span>
                </div>
              )}
            </div>

            <label className="ml-auto flex items-center gap-3">
              <span className="text-sm font-medium">目標終了に休憩を含める</span>
              <input type="checkbox" checked={includeBreakInTarget} onChange={(e) => setIncludeBreakInTarget(e.target.checked)} className="peer sr-only" />
              <span className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full border ${ includeBreakInTarget ? "border-sky-400 bg-sky-500" : "border-slate-300 bg-slate-300" } transition`}>
                <span className={`absolute left-1 inline-block h-4 w-4 rounded-full bg-white shadow transition ${ includeBreakInTarget ? "translate-x-5" : "" }`} />
              </span>
            </label>
          </div>

          {/* 目標終了プレビュー（グレー補助：経過／残り） */}
          <div className="mt-4 space-y-2 text-sm">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              {previewEnd ? (
                <>
                  <div className="text-base font-medium">
                    目標終了時刻（始業＋目標 {includeBreakInTarget ? "＋休憩" : ""}）：
                  </div>
                  <div className="mt-1 flex items-baseline gap-3">
                    <div className="text-2xl font-semibold">{previewEnd.label}</div>
                    <div className="text-xs text-slate-600">
                      （経過 <span className="font-mono">{timeStats.el.h}</span> 時間
                      <span className="font-mono">{String(timeStats.el.m).padStart(2, "0")}</span> 分 ／
                      目標まであと <span className="font-mono">{timeStats.rem.h}</span> 時間
                      <span className="font-mono">{String(timeStats.rem.m).padStart(2, "0")}</span> 分）
                      {timeStats.rem.passed && <span className="ml-1">※目標時刻を過ぎています</span>}
                    </div>
                  </div>
                  {previewEnd.nextDay && <span className="text-sm">（翌日）</span>}
                </>
              ) : (
                <span>始業・休憩・目標の入力で目標終了時刻を表示します。</span>
              )}
            </div>
          </div>

          {/* 確定・解除 */}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={onConfirm} className="rounded-lg bg-sky-600 px-5 py-2.5 font-medium text-white shadow-sm hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400">計算を確定</button>
            <button type="button" onClick={onResetConfirm} className="rounded-lg border border-sky-300 bg-white px-5 py-2.5 font-medium text-slate-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300">確定の解除</button>
          </div>

          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        </div>

        {/* ====== 結果（丸め＆15分単位：横並び→狭いと縦3段） ====== */}
        {durationSeconds != null && (
          <section className="mt-6 grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">結果</h2>

              {/* 横並び（md以上3列）／狭い幅（1列＝縦3段） */}
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {/* 時間の丸め */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-700">時間の丸め</span>
                  <div className={tabGroup}>
                    <button type="button" onClick={() => setHoursRounding("floor")} className={`${tabBase} ${hoursRounding === "floor" ? tabActive : tabInactive}`}>切捨</button>
                    <button type="button" onClick={() => setHoursRounding("ceil")}  className={`${tabBase} border-l border-sky-300 ${hoursRounding === "ceil"  ? tabActive : tabInactive}`}>切上</button>
                  </div>
                </div>

                {/* 分の丸め（15分単位オン時は見た目グレー） */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-700">分の丸め</span>
                  <div className={`${tabGroup} ${quarterMode !== "off" ? "opacity-60 pointer-events-none" : ""}`}>
                    <button type="button" onClick={() => setMinutesRounding("floor")} className={`${tabBase} ${minutesRounding === "floor" ? tabActive : tabInactive}`}>切捨</button>
                    <button type="button" onClick={() => setMinutesRounding("ceil")}  className={`${tabBase} border-l border-sky-300 ${minutesRounding === "ceil"  ? tabActive : tabInactive}`}>切上</button>
                  </div>
                </div>

                {/* 15分単位 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-700">15分単位</span>
                  <div className={tabGroup}>
                    <button type="button" onClick={() => setQuarterMode("off")}   className={`${tabBase} ${quarterMode === "off"   ? tabActive : tabInactive}`}>オフ</button>
                    <button type="button" onClick={() => setQuarterMode("floor")} className={`${tabBase} border-l border-sky-300 ${quarterMode === "floor" ? tabActive : tabInactive}`}>切捨</button>
                    <button type="button" onClick={() => setQuarterMode("ceil")}  className={`${tabBase} border-l border-sky-300 ${quarterMode === "ceil"  ? tabActive : tabInactive}`}>切上</button>
                  </div>
                </div>
              </div>

              {/* 正味（休憩差引） */}
              <div className="mt-5 space-y-5">
                {/* 時間（休憩を除く） */}
                <div>
                  <div className="flex items-center justify-between">
                    <span>時間（休憩を除く）</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={hoursBase == null}
                        onClick={() => hoursBase != null && copyText(formatHoursByMode(hoursBase, hoursRounding), setCopiedHour)}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${hoursBase != null ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                      >数字をコピー</button>
                      {copiedHour && <span className="text-xs text-emerald-700">コピーしました</span>}
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <div className="text-xl font-semibold">
                      <strong className="font-mono">{hoursBase != null ? formatHoursByMode(hoursBase, hoursRounding) : "--"}</strong> 時間
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
                          if (quarterMode === "off" && minutesDecimal != null) copyText(formatMinutesByMode(minutesDecimal, minutesRounding), setCopiedMinute);
                          else if (minutesRounded != null) copyText(String(Math.round(minutesRounded)), setCopiedMinute);
                        }}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${(quarterMode === "off" ? minutesDecimal != null : minutesRounded != null) ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                      >数字をコピー</button>
                      {copiedMinute && <span className="text-xs text-emerald-700">コピーしました</span>}
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <div className="text-xl font-semibold">
                      <strong className="font-mono">
                        {quarterMode === "off"
                          ? (minutesDecimal != null ? formatMinutesByMode(minutesDecimal, minutesRounding) : "--")
                          : (minutesRounded != null ? String(Math.round(minutesRounded)) : "--")}
                      </strong> 分
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ==== 目標までの残り／超過（確定後に必ず表示） ==== */}
            <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">目標までの残り／超過</h2>
              <div className="mt-3 space-y-2">
                {remainingSec != null && overSec != null && remainingSec === 0 && overSec === 0 ? (
                  <p className="font-semibold text-emerald-700">到達（±0分）</p>
                ) : remainingSec != null && remainingSec > 0 ? (
                  <p className="font-semibold">
                    目標労働時間 {targetH}時間 {String(targetM).padStart(2, "0")}分 にはあと{" "}
                    <span className="font-mono">{remainingHm!.h}</span> 時間{" "}
                    <span className="font-mono">{String(remainingHm!.m).padStart(2, "0")}</span> 分必要です。
                  </p>
                ) : overSec != null ? (
                  <p className="font-semibold">
                    目標労働時間 {targetH}時間 {String(targetM).padStart(2, "0")}分 を{" "}
                    <span className="font-mono">{overHm!.h}</span> 時間{" "}
                    <span className="font-mono">{String(overHm!.m).padStart(2, "0")}</span> 分超過しています。
                  </p>
                ) : (
                  <p className="text-sm text-slate-600">※確定後に残り／超過が表示されます。</p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
