import streamDeck, { action, SingletonAction, type WillAppearEvent, type WillDisappearEvent, type KeyDownEvent } from "@elgato/streamdeck";
import { createCanvas } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface UsageResponse {
	five_hour: { utilization: number; resets_at: string | null };
	seven_day: { utilization: number; resets_at: string | null };
}

const SIZE = 144;
// Usage barely moves minute-to-minute and the endpoint rate-limits hard, so poll
// gently. On failure (the endpoint 429s constantly) back off exponentially up to
// 30 min; reset to base on any success or a manual button press.
const BASE_INTERVAL = 120_000;   // 2 min
const MAX_INTERVAL = 1_800_000;  // 30 min
const STALE_CEILING = 360_000;   // hold last-good numbers for up to 6 min before greying
// Shared with the /claude-usage skill: every successful poll writes the last-good
// reading here so the skill can read usage without hitting the rate-limited API.
const CACHE_PATH = join(homedir(), ".claude", "usage-cache.json");

function renderButton(line1: string, line2: string, line3: string, bgColour: string): string {
	const canvas = createCanvas(SIZE, SIZE);
	const ctx = canvas.getContext("2d");

	ctx.fillStyle = bgColour;
	ctx.beginPath();
	ctx.roundRect(0, 0, SIZE, SIZE, 12);
	ctx.fill();

	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 24px Arial";

	if (line3) {
		ctx.fillText(line1, SIZE / 2, 36);
		ctx.fillText(line2, SIZE / 2, 72);
		ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
		ctx.font = "22px Arial";
		ctx.fillText(line3, SIZE / 2, 112);
	} else {
		ctx.fillText(line1, SIZE / 2, 52);
		ctx.fillText(line2, SIZE / 2, 88);
	}

	return canvas.toBuffer("image/png").toString("base64");
}

@action({ UUID: "com.jamesrose.claude-usage.display" })
export class UsageDisplayAction extends SingletonAction {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private lastLines: { line1: string; line2: string; line3: string } | null = null;
	private lastColour: string | null = null;
	private lastGoodAt = 0;
	private currentInterval = BASE_INTERVAL;

	override onWillAppear(ev: WillAppearEvent): void {
		this.stopTimer();
		this.currentInterval = BASE_INTERVAL;
		this.update(ev.action);
		this.scheduleNext();
	}

	override onWillDisappear(_ev: WillDisappearEvent): void {
		this.stopTimer();
	}

	override onKeyDown(ev: KeyDownEvent): void {
		this.stopTimer();
		this.currentInterval = BASE_INTERVAL; // manual press = retry now, reset backoff
		this.update(ev.action);
		this.scheduleNext();
	}

	private stopTimer(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private scheduleNext(): void {
		this.stopTimer();
		this.timer = setTimeout(async () => {
			let anyOk = false;
			for (const a of this.actions) {
				anyOk = (await this.update(a)) || anyOk;
			}
			// Success returns to the steady cadence; a failed round backs off so we
			// stop hammering a rate-limited endpoint.
			this.currentInterval = anyOk
				? BASE_INTERVAL
				: Math.min(this.currentInterval * 2, MAX_INTERVAL);
			this.scheduleNext();
		}, this.currentInterval);
	}

	private async update(action: { setImage(image: string): Promise<void>; setTitle(title: string): Promise<void> }): Promise<boolean> {
		try {
			const token = this.getToken();
			if (!token) {
				const img = renderButton("Refresh", "Claude", "", "#666666");
				await action.setImage(`data:image/png;base64,${img}`);
				await action.setTitle("");
				return false;
			}

			const usage = await this.fetchUsage(token);
			const fiveHr = Math.round(usage.five_hour.utilization);
			const sevenDay = Math.round(usage.seven_day.utilization);
			const maxUtil = Math.max(fiveHr, sevenDay);

			const colour = maxUtil >= 80 ? "#c0392b"
				: maxUtil >= 50 ? "#f39c12"
				: "#27ae60";

			const resetTime = this.formatResetTime(usage.five_hour.resets_at);
			this.lastLines = { line1: `5h: ${fiveHr}%`, line2: `7d: ${sevenDay}%`, line3: resetTime };
			this.lastColour = colour;
			this.lastGoodAt = Date.now();
			this.writeCache(usage);
			const img = renderButton(this.lastLines.line1, this.lastLines.line2, this.lastLines.line3, colour);
			await action.setImage(`data:image/png;base64,${img}`);
			await action.setTitle("");
			return true;
		} catch (e) {
			// 429s are constant on this endpoint and don't cost quota; we just keep
			// retrying at the steady interval. Hold the last good colour while the
			// displayed numbers are still fresh enough to trust, then go grey so a
			// genuine outage (or being stale through a heavy burst) is obvious.
			const ageMs = Date.now() - this.lastGoodAt;
			const fresh = this.lastLines !== null && ageMs < STALE_CEILING;
			streamDeck.logger.error(`Update failed (last good ${this.lastGoodAt ? Math.round(ageMs / 1000) + "s ago" : "never"}, ${fresh ? "holding" : "grey"})`, e);

			if (fresh) {
				const img = renderButton(this.lastLines!.line1, this.lastLines!.line2, this.lastLines!.line3, this.lastColour!);
				await action.setImage(`data:image/png;base64,${img}`);
			} else {
				const { line1, line2, line3 } = this.lastLines ?? { line1: "Stale", line2: "", line3: "" };
				const img = renderButton(line1, line2, line3, "#666666");
				await action.setImage(`data:image/png;base64,${img}`);
			}
			await action.setTitle("");
			return false;
		}
	}

	private writeCache(usage: UsageResponse): void {
		try {
			writeFileSync(CACHE_PATH, JSON.stringify({
				fetched_at: new Date().toISOString(),
				five_hour: { utilization: usage.five_hour.utilization, resets_at: usage.five_hour.resets_at },
				seven_day: { utilization: usage.seven_day.utilization, resets_at: usage.seven_day.resets_at },
			}));
		} catch {
			// best-effort; never let a cache write break the display
		}
	}

	private getToken(): string | null {
		try {
			const credPath = join(homedir(), ".claude", ".credentials.json");
			const creds = JSON.parse(readFileSync(credPath, "utf8"));
			const oauth = creds.claudeAiOauth;
			if (oauth.expiresAt < Date.now()) return null;
			return oauth.accessToken;
		} catch {
			return null;
		}
	}

	private async fetchUsage(token: string): Promise<UsageResponse> {
		const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
			headers: {
				"Authorization": `Bearer ${token}`,
				"anthropic-beta": "oauth-2025-04-20"
			}
		});
		if (!res.ok) throw new Error(`API ${res.status}`);
		return res.json() as Promise<UsageResponse>;
	}

	private formatResetTime(resetsAt: string | null): string {
		if (!resetsAt) return "";
		const reset = new Date(resetsAt);
		const hrs = reset.getHours();
		const mins = reset.getMinutes();
		const ampm = hrs >= 12 ? "pm" : "am";
		const h = hrs % 12 || 12;
		const m = mins.toString().padStart(2, "0");
		return `@ ${h}:${m}${ampm}`;
	}
}
