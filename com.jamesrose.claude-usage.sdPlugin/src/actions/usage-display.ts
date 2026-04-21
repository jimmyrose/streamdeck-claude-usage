import { action, SingletonAction, type WillAppearEvent, type WillDisappearEvent, type KeyDownEvent, type KeyAction } from "@elgato/streamdeck";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface UsageResponse {
	five_hour: { utilization: number; resets_at: string | null };
	seven_day: { utilization: number; resets_at: string | null };
}

@action({ UUID: "com.jamesrose.claude-usage.display" })
export class UsageDisplayAction extends SingletonAction {
	private timer: ReturnType<typeof setInterval> | null = null;
	private readonly POLL_INTERVAL = 30_000;

	override onWillAppear(ev: WillAppearEvent): void {
		this.update(ev.action as unknown as KeyAction);
		this.timer = setInterval(() => {
			for (const a of this.actions) {
				this.update(a as unknown as KeyAction);
			}
		}, this.POLL_INTERVAL);
	}

	override onWillDisappear(_ev: WillDisappearEvent): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	override onKeyDown(ev: KeyDownEvent): void {
		this.update(ev.action as unknown as KeyAction);
	}

	private async update(action: KeyAction): Promise<void> {
		try {
			const token = this.getToken();
			if (!token) {
				await this.render(action, "Refresh", "Claude", "#666666");
				return;
			}

			const usage = await this.fetchUsage(token);
			const fiveHr = Math.round(usage.five_hour.utilization);
			const sevenDay = Math.round(usage.seven_day.utilization);
			const maxUtil = Math.max(fiveHr, sevenDay);

			const colour = maxUtil >= 80 ? "#c0392b"
				: maxUtil >= 50 ? "#f39c12"
				: "#27ae60";

			await this.render(action, `5h: ${fiveHr}%`, `7d: ${sevenDay}%`, colour);
		} catch {
			await this.render(action, "Error", "", "#666666");
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

	private async render(action: KeyAction, line1: string, line2: string, bgColour: string): Promise<void> {
		const svg = [
			`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">`,
			`<rect width="144" height="144" rx="12" fill="${bgColour}"/>`,
			`<text x="72" y="62" text-anchor="middle" fill="white" font-size="24" font-family="Arial, sans-serif" font-weight="bold">${line1}</text>`,
			`<text x="72" y="98" text-anchor="middle" fill="white" font-size="24" font-family="Arial, sans-serif" font-weight="bold">${line2}</text>`,
			`</svg>`
		].join("");

		const base64 = Buffer.from(svg).toString("base64");
		await action.setImage(`data:image/svg+xml;base64,${base64}`);
		await action.setTitle("");
	}
}
