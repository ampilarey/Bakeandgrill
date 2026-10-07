import { useId } from 'react';
import './AnimatedLogo.css';
import { AMP_STOPS, AMP_TOP, DROP_STOPS, MAIN, OUTER, PATHS } from './animatedLogoShapes';

/**
 * The Bake & Grill logo drawn as shapes, with the flames moving gently
 * (owner, 2026-10-07). Sits on the same 1080 canvas as brand/logo-light.png, so
 * it takes the image's place without moving anything. The lettering follows
 * the theme (dark text, cream on [data-theme="dark"]) unless `variant` fixes it;
 * the flames hold still under prefers-reduced-motion or `animate={false}`.
 */
export function AnimatedLogo({
  size = 40,
  label = 'Bake & Grill Cafe',
  variant = 'auto',
  animate = true,
  className = '',
}: {
  size?: number;
  /** What screen readers hear; pass '' when a link around it already names it. */
  label?: string;
  variant?: 'auto' | 'light' | 'dark';
  animate?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const text = variant === 'light' ? '#1C1408' : variant === 'dark' ? '#FFFDF9' : undefined;
  const textProps = text ? { fill: text } : { className: 'bgl-t' };
  const ampTop = text ? { stopColor: text } : { className: 'bgl-at' };
  const classes = ['bgl', animate ? '' : 'bgl--still', className].filter(Boolean).join(' ');

  return (
    <svg
      className={classes}
      viewBox="0 0 1080 1080"
      width={size}
      height={size}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <defs>
        <linearGradient id={`bgl-drop${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="408" x2="0" y2="752">
          {DROP_STOPS.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`bgl-amp${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="784" x2="0" y2="915">
          <stop offset={0} {...ampTop} />
          <stop offset={AMP_TOP} {...ampTop} />
          {AMP_STOPS.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <g className="bgl-f bgl-ol" fill={OUTER}>
        <path d={PATHS.flame_outer_left} />
      </g>
      <g className="bgl-f bgl-or" fill={OUTER}>
        <path d={PATHS.flame_outer_right} />
      </g>
      <g className="bgl-f bgl-main" fill={MAIN}>
        <path d={PATHS.flame_main} />
      </g>
      <g className="bgl-f bgl-in" fill={`url(#bgl-drop${uid})`}>
        <path d={PATHS.flame_inner} />
      </g>
      <g {...textProps}>
        <path d={PATHS.text_bg} />
      </g>
      <g fill={`url(#bgl-amp${uid})`}>
        <path d={PATHS.text_amp} />
      </g>
      <g {...textProps}>
        <path d={PATHS.text_cafe} />
      </g>
    </svg>
  );
}

