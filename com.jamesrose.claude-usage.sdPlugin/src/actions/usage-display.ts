import streamDeck, { action, SingletonAction, type WillAppearEvent, type WillDisappearEvent, type KeyDownEvent } from "@elgato/streamdeck";
import { createCanvas } from "@napi-rs/canvas";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface UsageResponse {
	five_hour: { utilization: number; resets_at: string | null };
	seven_day: { utilization: number; resets_at: string | null };
}

const SIZE = 144;
const BASE_INTERVAL = 30_000;
const MAX_INTERVAL = 300_000;

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
	private consecutiveFailures = 0;
	private lastLines: { line1: string; line2: string; line3: string } | null = null;
	private currentInterval = BASE_INTERVAL;

	override onWillAppear(ev: WillAppearEvent): void {
		this.stopTimer();
		this.update(ev.action);
		this.scheduleNext();
	}

	override onWillDisappear(_ev: WillDisappearEvent): void {
		this.stopTimer();
	}

	override onKeyDown(ev: KeyDownEvent): void {
		this.consecutiveFailures = 0;
		this.currentInterval = BASE_INTERVAL;
		this.stopTimer();
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
			for (const a of this.actions) {
				await this.update(a);
			}
			this.scheduleNext();
		}, this.currentInterval);
	}

	private async update(action: { setImage(image: string): Promise<void>; setTitle(title: string): Promise<void> }): Promise<void> {
		try {
			const token = this.getToken();
			if (!token) {
				const img = renderButton("Refresh", "Claude", "", "#666666");
				await action.setImage(`data:image/png;base64,${img}`);
				await action.setTitle("");
				return;
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
			this.consecutiveFailures = 0;
			this.currentInterval = BASE_INTERVAL;
			const img = renderButton(this.lastLines.line1, this.lastLines.line2, this.lastLines.line3, colour);
			await action.setImage(`data:image/png;base64,${img}`);
			await action.setTitle("");
		} catch (e) {
			this.consecutiveFailures++;
			this.currentInterval = Math.min(BASE_INTERVAL * Math.pow(2, this.consecutiveFailures), MAX_INTERVAL);
			streamDeck.logger.error(`Update failed (${this.consecutiveFailures}x, next in ${Math.round(this.currentInterval / 1000)}s)`, e);

			if (this.consecutiveFailures >= 5) {
				const img = renderButton("Error", "", "", "#666666");
				await action.setImage(`data:image/png;base64,${img}`);
				await action.setTitle("");
			} else if (this.consecutiveFailures >= 2) {
				const { line1, line2, line3 } = this.lastLines ?? { line1: "Error", line2: "", line3: "" };
				const img = renderButton(line1, line2, line3, "#666666");
				await action.setImage(`data:image/png;base64,${img}`);
				await action.setTitle("");
			}
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
