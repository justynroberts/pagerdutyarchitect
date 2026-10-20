import { LOGO_PATH, LOGO_VIEWBOX } from '../lib/logo'

/** PagerDuty wordmark. Takes its colour from `currentColor`. */
export function Logo({ className, ...rest }: { className?: string; 'data-corner'?: string }) {
  return (
    <svg className={className} viewBox={LOGO_VIEWBOX} role="img" aria-label="PagerDuty" fill="currentColor" {...rest}>
      <path d={LOGO_PATH} fillRule="evenodd" />
    </svg>
  )
}
