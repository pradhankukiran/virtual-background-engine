#version 300 es
precision highp float;

uniform sampler2D u_bgImage;
uniform vec2 u_bgSize;      // Original image dimensions
uniform vec2 u_outputSize;  // Output canvas dimensions

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Compute cover-mode UV mapping
  float bgAspect = u_bgSize.x / u_bgSize.y;
  float outAspect = u_outputSize.x / u_outputSize.y;

  vec2 uv = v_uv;

  if (bgAspect > outAspect) {
    // Image wider than output: crop sides
    float scale = outAspect / bgAspect;
    uv.x = uv.x * scale + (1.0 - scale) * 0.5;
  } else {
    // Image taller than output: crop top/bottom
    float scale = bgAspect / outAspect;
    uv.y = uv.y * scale + (1.0 - scale) * 0.5;
  }

  fragColor = texture(u_bgImage, uv);
}
