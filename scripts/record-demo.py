#!/usr/bin/env python3
"""Record a short, read-only product tour from the local Vite preview.

The recording reads existing NEAR testnet challenges only. It never connects a
wallet, signs a transaction, spends tokens, or includes private account data.
Requires the app preview at http://127.0.0.1:4173, Playwright, Chromium, and ffmpeg.
Before recording, install Playwright's video helper with `python3 -m playwright install ffmpeg`.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "demo-video.mp4"
APP_URL = os.environ.get("DEMO_APP_URL", "http://127.0.0.1:4173/")
WIDTH, HEIGHT = 1600, 900


def hold(seconds: float) -> None:
    time.sleep(seconds)


def set_caption(page, text: str) -> None:
    page.evaluate(
        """(text) => {
          let caption = document.getElementById('demo-recording-caption');
          if (!caption) {
            caption = document.createElement('div');
            caption.id = 'demo-recording-caption';
            caption.setAttribute('aria-hidden', 'true');
            Object.assign(caption.style, {
              position: 'fixed', left: '50%', bottom: '20px', transform: 'translateX(-50%)',
              zIndex: '2147483647', width: 'min(1260px, calc(100vw - 72px))',
              padding: '15px 22px', border: '1px solid rgba(200,255,94,.52)',
              background: 'rgba(7,13,17,.94)', color: '#edf0e7', textAlign: 'center',
              font: '500 21px/1.35 system-ui, sans-serif', letterSpacing: '.01em',
              boxShadow: '0 12px 42px rgba(0,0,0,.38)',
            });
            document.body.appendChild(caption);
          }
          caption.textContent = text;
        }""",
        text,
    )


def launch_chromium(playwright):
    options = {
        "headless": True,
        "executable_path": "/usr/bin/chromium",
        "args": ["--no-sandbox", "--disable-dev-shm-usage"],
    }
    return playwright.chromium.launch(**options)


def main() -> None:
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required to encode the X-ready MP4.")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="pos-demo-record-") as record_dir:
        with sync_playwright() as playwright:
            browser = launch_chromium(playwright)
            context = browser.new_context(
                viewport={"width": WIDTH, "height": HEIGHT},
                device_scale_factor=1,
                record_video_dir=record_dir,
                record_video_size={"width": WIDTH, "height": HEIGHT},
                reduced_motion="reduce",
            )
            page = context.new_page()
            page_errors: list[str] = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))

            response = page.goto(APP_URL, wait_until="domcontentloaded", timeout=60_000)
            if response is None or response.status >= 400:
                raise RuntimeError(f"Demo page did not load successfully: {response.status if response else 'no response'}")
            page.wait_for_function(
                "document.querySelector('#metric-count')?.textContent?.trim() !== '—'",
                timeout=60_000,
            )
            page.wait_for_selector(".challenge-card", timeout=30_000)
            page.wait_for_timeout(900)

            count = page.locator(".challenge-card").count()
            if count < 4:
                raise RuntimeError(f"Expected the four verified testnet challenges; found {count}.")
            ids = page.locator(".challenge-id").all_text_contents()
            if not any("#3" in text for text in ids) or not any("#4" in text for text in ids):
                raise RuntimeError(f"Expected verified challenge #3 and #4; found {ids!r}.")

            video = page.video
            set_caption(page, "A NEAR testnet market for verifiable optimization bounties.")
            hold(4)

            page.evaluate("window.scrollTo({ top: document.querySelector('#market').offsetTop - 80, behavior: 'auto' })")
            page.wait_for_timeout(350)
            set_caption(page, "Live challenge state is read directly from the contract.")
            hold(4)

            challenge_three = page.locator(".challenge-card").filter(has_text="BOUNTY #3").first
            challenge_three.scroll_into_view_if_needed()
            set_caption(page, "Challenge #3: two routes submitted; the contract retained the best score, 40.")
            hold(5)

            challenge_four = page.locator(".challenge-card").filter(has_text="BOUNTY #4").first
            challenge_four.scroll_into_view_if_needed()
            set_caption(page, "A distinct solver account finalized and claimed the net bounty on testnet.")
            hold(5)

            page.evaluate("const el = document.querySelector('#create'); window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 160, behavior: 'auto' })")
            page.wait_for_timeout(350)
            set_caption(page, "There are no open bounties now; create one with a testnet wallet to start a new challenge.")
            hold(4)

            page.locator("#how-it-works").scroll_into_view_if_needed()
            set_caption(page, "After the deadline, anyone may finalize; the recipient must explicitly claim.")
            hold(5)

            page.evaluate(
                """() => {
                  document.getElementById('demo-recording-caption')?.remove();
                  const end = document.createElement('div');
                  end.id = 'demo-recording-endcard';
                  Object.assign(end.style, {
                    position: 'fixed', inset: '0', zIndex: '2147483646',
                    display: 'grid', placeItems: 'center', padding: '56px',
                    background: 'radial-gradient(ellipse at 75% 25%, rgba(200,255,94,.10), transparent 38%), #0b1015',
                    color: '#edf0e7', fontFamily: 'system-ui, sans-serif', textAlign: 'center',
                  });
                  end.innerHTML = `
                    <div style="max-width:1100px">
                      <div style="font:500 14px/1.4 monospace;letter-spacing:.22em;color:#c8ff5e;margin-bottom:25px">NEAR TESTNET · PROTOTYPE</div>
                      <div style="font:700 64px/1.05 system-ui,sans-serif;letter-spacing:-.055em">Proof-of-Score Bounty</div>
                      <div style="font:400 25px/1.5 system-ui,sans-serif;color:#a8b5ae;margin:22px auto 34px;max-width:900px">The contract verifies the published route score. Finalized recipients claim the net bounty.</div>
                      <div style="font:500 19px/1.7 monospace;color:#c8ff5e">taku629.github.io/ear-proof-of-score/</div>
                      <div style="font:500 19px/1.7 monospace;color:#dbe2dc">github.com/taku629/ear-proof-of-score</div>
                      <div style="font:500 13px/1.5 monospace;color:#88958d;letter-spacing:.12em;margin-top:32px">NO MAINNET FUNDS · SCORE ≠ GLOBAL OPTIMALITY OR AI PROVENANCE</div>
                    </div>`;
                  document.body.appendChild(end);
                }"""
            )
            hold(5)

            context.close()
            webm_path = Path(video.path())
            browser.close()
            if page_errors:
                raise RuntimeError("Browser errors during recording: " + " | ".join(page_errors))

        if not webm_path.is_file() or webm_path.stat().st_size == 0:
            raise RuntimeError("Playwright did not produce a video file.")
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(webm_path), "-an", "-c:v", "libx264",
                "-preset", "medium", "-crf", "25", "-pix_fmt", "yuv420p",
                "-r", "30", "-movflags", "+faststart", str(OUTPUT),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

    print(f"Created {OUTPUT}")
    print(f"Size: {OUTPUT.stat().st_size:,} bytes")
    print("This video is a read-only testnet walkthrough; it contains no wallet signing or transactions.")


if __name__ == "__main__":
    main()
