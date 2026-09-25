import { css } from 'styled-components'
import { APP_ACCENT } from '../constants'

/**
 * The two hues the link map needs, as app-owned variables.
 *
 * Built and promised are domain meanings, not platform states, so they are
 * named here once and relit for dark rather than written as literals wherever
 * a line or a chip needs them. The promise hue is the platform's attention
 * ramp, because that is what it is: something waiting to be done.
 */
export const siteLinkTheme = css`
  --site-accent: ${APP_ACCENT};
  --site-accent-wash: color-mix(in srgb, var(--site-accent) 16%, transparent);
  --site-built-line: color-mix(in srgb, var(--site-accent) 55%, transparent);
  --site-promise-ink: var(--pure-attention-text);
  --site-promise-line: color-mix(in srgb, var(--pure-attention-text) 75%, transparent);
  --site-promise-edge: color-mix(in srgb, var(--pure-attention-text) 45%, transparent);
  --site-promise-wash: var(--pure-attention-muted);

  [data-platform-theme='dark'] & {
    --site-built-line: color-mix(in srgb, var(--site-accent) 70%, transparent);
    --site-promise-line: color-mix(in srgb, var(--pure-attention-text) 85%, transparent);
  }
`
