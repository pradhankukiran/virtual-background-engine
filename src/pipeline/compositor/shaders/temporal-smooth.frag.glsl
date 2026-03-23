#version 300 es
precision highp float;

uniform sampler2D u_currentMask;
uniform sampler2D u_prevMask;
uniform float u_alpha;           // EMA blend factor (0.6 = 60% new)
uniform float u_snapThreshold;   // Snap to 0 or 1 above this confidence

in vec2 v_uv;
out float fragColor;

void main() {
  float current = texture(u_currentMask, v_uv).r;
  float prev = texture(u_prevMask, v_uv).r;

  // EMA blend
  float blended = mix(prev, current, u_alpha);

  // Soft snap: push toward 0/1 at extremes but preserve gradients for hair/edges
  if (blended > u_snapThreshold) {
    blended = mix(blended, 1.0, 0.5);
  } else if (blended < 1.0 - u_snapThreshold) {
    blended = mix(blended, 0.0, 0.5);
  }

  fragColor = blended;
}
