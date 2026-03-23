#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_offset;    // Increases each pass (0.5, 1.5, 2.5, ...)

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 off = u_texelSize * (u_offset + 0.5);

  vec4 sum = texture(u_texture, v_uv);
  sum += texture(u_texture, v_uv + vec2(-off.x, -off.y));
  sum += texture(u_texture, v_uv + vec2( off.x, -off.y));
  sum += texture(u_texture, v_uv + vec2(-off.x,  off.y));
  sum += texture(u_texture, v_uv + vec2( off.x,  off.y));

  fragColor = sum / 5.0;
}
