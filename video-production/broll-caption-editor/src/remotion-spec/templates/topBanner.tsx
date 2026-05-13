import { AbsoluteFill } from 'remotion';
import type { VideoSpecWithTimeline } from '../templateProps';
import { mergeLayerAppearance } from '../appearance';
import { blockEntranceStyle } from '../animations';
import { flexAlignForTextAlign } from '../alignLayout';
import { resolveLayoutPx } from '../layout';
import { cardBoldOutlineCaptionStyle, isBoldOutlineLayer } from '../textTreatment';
import { activeCaptionLayers } from '../activeLayers';

export default function TopBannerTemplate({ spec, frame, fps }: VideoSpecWithTimeline) {
  const sec = frame / fps;
  const layout = resolveLayoutPx(spec);
  const layers = activeCaptionLayers(spec, sec);
  const ta = layout.textAlign;
  const cross = flexAlignForTextAlign(ta);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          maxHeight: '50%',
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: cross,
          paddingTop: '100px',
          paddingLeft: layout.paddingPx,
          paddingRight: layout.paddingPx,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          transform: layout.translateY,
          gap: layout.stackGapPx,
        }}
      >
        {layers.map((layer) => {
          const layerTheme = mergeLayerAppearance(spec, layer.kind === 'block' ? layer.appearance : null);
          const startFrame = Math.round(layer.startSec * fps);
          const animStyle = blockEntranceStyle(frame, fps, startFrame, layer.animation);
          const baseSize = layer.kind === 'hook' ? 56 : 50;
          const ctaScaled = layer.isCTA ? Math.round(baseSize * layerTheme.ctaScale) : baseSize;
          const fontSize = Math.round(ctaScaled * layout.scale);
          return (
            <div
              key={layer.key}
              style={{
                display: 'inline-block',
                maxWidth: layout.innerWidth,
                backgroundColor: layerTheme.cardBg === 'transparent' ? 'rgba(255,255,255,0.94)' : layerTheme.cardBg,
                borderRadius: '14px',
                padding: '22px 28px',
                opacity: animStyle.opacity,
                transform: animStyle.transform,
              }}
            >
              <p
                style={{
                  fontSize,
                  fontWeight: 800,
                  fontFamily: layerTheme.bodyFontStack,
                  color: layerTheme.cardText,
                  margin: 0,
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                  ...(isBoldOutlineLayer(spec, layer) ? cardBoldOutlineCaptionStyle() : {}),
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  textAlign: ta,
                }}
              >
                {layer.text}
              </p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
