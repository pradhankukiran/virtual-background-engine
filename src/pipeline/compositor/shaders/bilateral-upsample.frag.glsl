#version 300 es
precision highp float;

uniform sampler2D u_mask;       // Low-res mask (256x256, R8)
uniform sampler2D u_guide;      // Camera frame (748x420, RGBA8)
uniform vec2 u_maskTexelSize;   // 1/256, 1/256

in vec2 v_uv;
out float fragColor;

// Spatial sigma in mask texels
const float SIGMA_SPATIAL = 2.0;
// Range sigma for guide intensity difference (lower = more edge-sensitive, helps distinguish
// similar-colored person from background like dark shirt vs dark sofa)
const float SIGMA_RANGE = 0.06;

void main() {
  vec3 centerGuide = texture(u_guide, v_uv).rgb;
  float centerLum = dot(centerGuide, vec3(0.2126, 0.7152, 0.0722));

  float totalWeight = 0.0;
  float totalMask = 0.0;

  // 5x5 separable bilateral filter
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec2 offset = vec2(float(dx), float(dy)) * u_maskTexelSize;
      vec2 sampleUV = v_uv + offset;

      float maskVal = texture(u_mask, sampleUV).r;
      vec3 guideVal = texture(u_guide, sampleUV).rgb;
      float guideLum = dot(guideVal, vec3(0.2126, 0.7152, 0.0722));

      // Spatial weight
      float dist2 = float(dx * dx + dy * dy);
      float ws = exp(-dist2 / (2.0 * SIGMA_SPATIAL * SIGMA_SPATIAL));

      // Range weight (guide similarity)
      float diff = centerLum - guideLum;
      float wr = exp(-(diff * diff) / (2.0 * SIGMA_RANGE * SIGMA_RANGE));

      float w = ws * wr;
      totalMask += maskVal * w;
      totalWeight += w;
    }
  }

  fragColor = totalWeight > 0.0 ? totalMask / totalWeight : 0.0;
}
