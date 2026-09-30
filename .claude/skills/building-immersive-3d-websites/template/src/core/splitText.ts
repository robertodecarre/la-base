import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Minimal word splitter + scroll reveal for [data-split] headings.
 * Keeps an aria-label with the original text so screen readers don't read fragments.
 * (GSAP SplitText is free since 2025 and handles lines/chars/masks — prefer it for complex cases.)
 */
export function revealHeadings(reducedMotion: boolean): void {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const text = el.textContent?.trim() ?? ''
    el.setAttribute('aria-label', text)
    el.innerHTML = text
      .split(/\s+/)
      .map((w) => `<span class="split-line" aria-hidden="true"><span class="split-word">${escapeHtml(w)}</span></span>`)
      .join(' ')
    if (reducedMotion) return

    gsap.from(el.querySelectorAll('.split-word'), {
      yPercent: 110,
      rotate: 4,
      duration: 1.1,
      ease: 'expo.out',
      stagger: 0.06,
      scrollTrigger: { trigger: el, start: 'top 80%', toggleActions: 'play none none reverse' },
    })
  })
  ScrollTrigger.refresh()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
