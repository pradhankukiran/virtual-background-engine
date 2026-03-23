#version 300 es
precision highp float;

uniform sampler2D u_composite;
uniform sampler2D u_mask;
uniform float u_fgLuminance;     // CPU-computed foreground luminance
uniform float u_targetLuminance; // Target luminance (0.45)

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Flip Y for final output: intermediate textures are in GL's bottom-up
  // coordinate space, but transferToImageBitmap() expects top-down.
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec4 color = texture(u_composite, uv);
  float mask = texture(u_mask, uv).r;

  // Compute exposure adjustment ratio (clamped)
  float ratio = u_fgLuminance > 0.01
    ? u_targetLuminance / u_fgLuminance
    : 1.0;
  ratio = clamp(ratio, 0.7, 1.4); // Limit correction range

  // Only apply correction to foreground (masked area)
  vec3 corrected = color.rgb * mix(1.0, ratio, mask * 0.5);

  fragColor = vec4(corrected, 1.0);
}
