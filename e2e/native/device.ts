/**
 * A minimal Android driver over adb: open deep links in Expo Go, read the screen through
 * uiautomator, scroll and tap. Enough for end-to-end checks without extra tooling.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const adbPath = process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, "platform-tools", "adb") : "adb";
const EXPO_GO = "host.exp.exponent";
/** Text React Native's red error screen shows. Seeing it anywhere fails the test at once. */
const CRASH = /^(render error|uncaught error|log \d+ of \d+|console error)$/i;

/** adb with a timeout: uiautomator can hang waiting for the UI to go idle. */
export const adb = (...args: string[]) =>
  execFileSync(adbPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 });

type Node = { text: string; desc: string; x: number; y: number };

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Device {
  constructor(private readonly metroUrl: string) {}

  static check() {
    if (!/\tdevice$/m.test(adb("devices"))) throw new Error("No Android device or emulator connected (adb devices).");
    if (!adb("shell", "pm", "list", "packages", EXPO_GO).includes(EXPO_GO)) {
      throw new Error("Expo Go isn't installed on the device. Run `expo start --android` once to install it.");
    }
  }

  /**
   * Cold-start the app on a route, e.g. "/bean/north-star/el-diviso", so each test starts from
   * a known state rather than wherever the last one left off.
   */
  launch(path: string) {
    adb("shell", "am", "force-stop", EXPO_GO);
    // `adb shell` runs this through the device's shell: quote the URL so `&` survives.
    adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `'${this.metroUrl}/--${path}'`, EXPO_GO);
  }

  /** Everything currently on screen. Text is as displayed (e.g. upper-cased labels). */
  async screen(): Promise<Node[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        adb("shell", "uiautomator", "dump", "/sdcard/ui.xml");
        const xml = adb("shell", "cat", "/sdcard/ui.xml");
        return [...xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)].map(
          ([, text, desc, x1, y1, x2, y2]) => ({
            text: decode(text!),
            desc: decode(desc!),
            x: (Number(x1) + Number(x2)) / 2,
            y: (Number(y1) + Number(y2)) / 2,
          }),
        );
      } catch (err) {
        // uiautomator refuses while the UI is mid-animation; try again shortly.
        if (attempt >= 5) throw err;
        await sleep(500);
      }
    }
  }

  private find(nodes: Node[], label: string | RegExp) {
    const matches = (s: string) => (typeof label === "string" ? norm(s) === norm(label) : label.test(s));
    return nodes.find((n) => matches(n.text) || matches(n.desc));
  }

  private assertNoCrash(nodes: Node[]) {
    if (nodes.some((n) => CRASH.test(n.text.trim()))) {
      throw new Error(`The app showed an error screen:\n${nodes.map((n) => n.text).filter(Boolean).join("\n")}`);
    }
  }

  /** Wait until every label is on screen (matched against text or accessibility label). */
  async expect(labels: (string | RegExp)[], timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const nodes = await this.screen();
      this.assertNoCrash(nodes);
      const missing = labels.filter((l) => !this.find(nodes, l));
      if (missing.length === 0) return;
      if (Date.now() > deadline) {
        throw new Error(`Not on screen: ${missing.join(", ")}\nScreen shows: ${nodes.map((n) => n.text || n.desc).filter(Boolean).join(" | ")}`);
      }
      await sleep(750);
    }
  }

  /** Scroll down until `label` is on screen. */
  async scrollTo(label: string | RegExp, maxSwipes = 12) {
    for (let i = 0; i <= maxSwipes; i++) {
      const nodes = await this.screen();
      this.assertNoCrash(nodes);
      const node = this.find(nodes, label);
      // Keep it clear of the bottom bar so a tap lands on it.
      if (node && node.y < 1800) return;
      // A slow drag rather than a fling, so the list settles before the next look.
      adb("shell", "input", "swipe", "540", "1700", "540", "1000", "700");
      await sleep(900);
    }
    throw new Error(`Couldn't scroll to: ${label}`);
  }

  async tap(label: string | RegExp) {
    const nodes = await this.screen();
    this.assertNoCrash(nodes);
    const node = this.find(nodes, label);
    if (!node) throw new Error(`Nothing to tap: ${label}`);
    adb("shell", "input", "tap", String(Math.round(node.x)), String(Math.round(node.y)));
    await sleep(400);
  }

  async swipeLeftAt(label: string | RegExp) {
    const node = this.find(await this.screen(), label);
    if (!node) throw new Error(`Nothing to swipe: ${label}`);
    adb("shell", "input", "swipe", "900", String(Math.round(node.y)), "150", String(Math.round(node.y)), "300");
    await sleep(800);
  }

  /** JavaScript errors React Native logged since the last clearLog(). */
  jsErrors(): string[] {
    return adb("logcat", "-d", "-v", "brief", "ReactNativeJS:E", "*:S")
      .split("\n")
      .filter((l) => l.startsWith("E/ReactNativeJS"));
  }

  clearLog() {
    adb("logcat", "-c");
  }
}
