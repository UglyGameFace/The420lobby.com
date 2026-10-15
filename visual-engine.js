/* The 420 Lobby: WebGL spectral fog + portal distortion. No runtime dependencies. */
(function () {
  "use strict";
  const canvas = document.getElementById("depth-canvas");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const hero = document.getElementById("home");
  const state = {
    enabled: !reduced.matches && !saveData,
    visible: true,
    pointer: [0, 0],
    scroll: 0,
    running: false,
    frame: 0,
    time: 0,
    lastFrame: 0,
    lowPower: window.innerWidth < 760 || saveData,
    contextLost: false,
    supported: false
  };

  if (!canvas || !hero) return;

  let gl = null;
  let program = null;
  let buffer = null;
  let locations = null;
  let quality = state.lowPower ? 0.45 : 0.65;
  let targetFrameTime = state.lowPower ? 40 : 28;

  const vertexShader = [
    "attribute vec2 aPosition;",
    "void main(){ gl_Position = vec4(aPosition,0.0,1.0); }"
  ].join("\n");

  const fragmentShader = [
    "precision mediump float;",
    "uniform vec2 uResolution;",
    "uniform vec2 uPointer;",
    "uniform float uTime;",
    "uniform float uScroll;",
    "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}",
    "float fbm(vec2 p){float value=0.0,amp=0.5;for(int i=0;i<4;i++){value+=amp*noise(p);p=p*2.02+vec2(4.1,8.6);amp*=0.48;}return value;}",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/max(uResolution,vec2(1.0));",
    "  vec2 p=(gl_FragCoord.xy-0.5*uResolution.xy)/min(uResolution.x,uResolution.y);",
    "  float t=uTime*0.09;",
    "  vec2 bend=vec2(fbm(p*1.5+vec2(t,-t*0.6)),fbm(p*1.8+vec2(-t,t*.5)));",
    "  vec2 warped=p+(bend-0.5)*0.28+uPointer*0.04;",
    "  float cloud=fbm(warped*3.0+vec2(t*0.6,-t*0.38));",
    "  float cloud2=fbm(warped*5.1-vec2(t*0.24,-t*0.18));",
    "  float glow=1.0-smoothstep(0.05,1.08,length(p-vec2(0.2,-0.02)));",
    "  float smoke=smoothstep(0.35,0.84,cloud)*0.68+smoothstep(0.46,0.82,cloud2)*0.22;",
    "  float ring=sin(length(warped*vec2(1.0,1.15))*18.0-t*4.0+cloud*5.0);",
    "  ring=smoothstep(0.77,1.0,ring)*0.12*glow;",
    "  vec3 green=vec3(0.22,0.72,0.44);",
    "  vec3 teal=vec3(0.25,0.72,0.71);",
    "  vec3 ember=vec3(0.9,0.54,0.25);",
    "  vec3 color=mix(green,teal,clamp(cloud2*1.12,0.0,1.0));",
    "  color=mix(color,ember,smoothstep(0.75,0.99,cloud2)*0.12);",
    "  float alpha=(smoke*.42+ring+glow*.065)*smoothstep(1.6,.2,length(p));",
    "  alpha*=1.0-uScroll*.3;",
    "  alpha*=smoothstep(0.0,.18,uv.y)*smoothstep(0.0,.12,1.0-uv.y);",
    "  gl_FragColor=vec4(color,clamp(alpha,0.0,0.42));",
    "}"
  ].join("\n");

  function shader(type, source) {
    const compiled = gl.createShader(type);
    gl.shaderSource(compiled, source);
    gl.compileShader(compiled);
    if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
      console.warn("Lobby WebGL shader unavailable:", gl.getShaderInfoLog(compiled));
      gl.deleteShader(compiled);
      return null;
    }
    return compiled;
  }

  function teardown() {
    stop();
    if (gl && !state.contextLost) {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
    buffer = null;
    program = null;
    locations = null;
    state.supported = false;
  }

  function setup() {
    if (state.contextLost) return;
    try {
      gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: "low-power"
      });
      if (!gl) return;
      const v = shader(gl.VERTEX_SHADER, vertexShader);
      const f = shader(gl.FRAGMENT_SHADER, fragmentShader);
      if (!v || !f) {
        if (v) gl.deleteShader(v);
        if (f) gl.deleteShader(f);
        return;
      }
      program = gl.createProgram();
      gl.attachShader(program, v);
      gl.attachShader(program, f);
      gl.linkProgram(program);
      gl.deleteShader(v);
      gl.deleteShader(f);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn("Lobby WebGL program unavailable:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        program = null;
        return;
      }
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      locations = {
        position: gl.getAttribLocation(program, "aPosition"),
        resolution: gl.getUniformLocation(program, "uResolution"),
        pointer: gl.getUniformLocation(program, "uPointer"),
        time: gl.getUniformLocation(program, "uTime"),
        scroll: gl.getUniformLocation(program, "uScroll")
      };
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(locations.position);
      gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      state.supported = true;
      resize();
    } catch (error) {
      console.warn("Lobby shader fallback activated:", error);
      teardown();
    }
  }

  function resize() {
    if (!gl || !state.supported) return;
    const scale = Math.min(quality, window.innerWidth < 760 ? 0.5 : 0.7);
    const actualWidth = Math.max(1, Math.min(1000, Math.round(canvas.clientWidth * scale)));
    const actualHeight = Math.max(1, Math.min(800, Math.round(canvas.clientHeight * scale)));
    if (canvas.width !== actualWidth || canvas.height !== actualHeight) {
      canvas.width = actualWidth;
      canvas.height = actualHeight;
      gl.viewport(0, 0, actualWidth, actualHeight);
    }
  }

  function stop() {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
    state.running = false;
  }

  function draw(now) {
    state.frame = 0;
    if (!state.enabled || !state.visible || document.hidden || !state.supported || state.contextLost) {
      state.running = false;
      return;
    }
    if (now - state.lastFrame >= targetFrameTime) {
      state.lastFrame = now;
      state.time = now * 0.001;
      resize();
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(locations.resolution, canvas.width, canvas.height);
      gl.uniform2f(locations.pointer, state.pointer[0], state.pointer[1]);
      gl.uniform1f(locations.time, state.time);
      gl.uniform1f(locations.scroll, state.scroll);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    state.frame = requestAnimationFrame(draw);
  }

  function start() {
    if (!state.enabled || !state.visible || document.hidden || !state.supported || state.contextLost || state.frame) return;
    state.running = true;
    state.frame = requestAnimationFrame(draw);
  }

  function setEnabled(enabled) {
    state.enabled = !!enabled && !reduced.matches && !saveData;
    if (!state.enabled) {
      stop();
      if (gl && state.supported && !state.contextLost) gl.clear(gl.COLOR_BUFFER_BIT);
    } else start();
    return state.enabled;
  }

  canvas.addEventListener("webglcontextlost", function(event) {
    event.preventDefault();
    state.contextLost = true;
    teardown();
  });
  canvas.addEventListener("webglcontextrestored", function() {
    state.contextLost = false;
    gl = null;
    setup();
    start();
  });
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) stop();
    else start();
  });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(function(entries) {
      state.visible = entries[0].isIntersecting;
      if (state.visible) start();
      else stop();
    }, {threshold: 0});
    observer.observe(hero);
  }
  if (window.matchMedia("(pointer:fine)").matches) {
    window.addEventListener("pointermove", function(event) {
      state.pointer[0] = event.clientX / Math.max(window.innerWidth,1)*2-1;
      state.pointer[1] = event.clientY / Math.max(window.innerHeight,1)*2-1;
    }, {passive:true});
  }
  window.addEventListener("resize", resize, {passive:true});
  window.LobbyAtmosphere = {
    setEnabled,
    isSupported: function() { return state.supported; },
    setScroll: function(value) { state.scroll = Math.min(1,Math.max(0,value)); },
    stop,
    start
  };
  if (state.enabled) {
    setup();
    start();
  }
})();