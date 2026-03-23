#version 300 es
precision highp float;

uniform sampler2D u_foreground;
uniform sampler2D u_background;
uniform sampler2D u_mask;
uniform float u_maskThreshold; // Confidence threshold for foreground matte
uniform float u_feather;       // Feather width around the mask threshold
uniform float u_lightWrap;    // Background light bleed into foreground edges

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 fg = texture(u_foreground, v_uv);
  vec4 bg = texture(u_background, v_uv);
  float mask = texture(u_mask, v_uv).r;

  // Threshold the confidence mask into a stable matte, then feather the edge.
  float feathered = smoothstep(
    u_maskThreshold - u_feather,
    u_maskThreshold + u_feather,
    mask
  );

  // Light wrap: blend background light into foreground only near matte edges.
  float wrapZone =
    smoothstep(u_maskThreshold - (u_feather * 2.0), u_maskThreshold, mask) *
    (1.0 - smoothstep(u_maskThreshold, u_maskThreshold + (u_feather * 2.0), mask));
  vec3 wrapped = mix(fg.rgb, mix(fg.rgb, bg.rgb, u_lightWrap), wrapZone);

  // Final composite
  vec3 color = mix(bg.rgb, wrapped, feathered);

  fragColor = vec4(color, 1.0);
}
