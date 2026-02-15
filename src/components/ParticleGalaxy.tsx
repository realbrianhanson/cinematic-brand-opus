import { useEffect, useRef } from "react";
import * as THREE from "three";

const vertexShader = `
  attribute float aSize;
  attribute float aRandom;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    // Gentle rotation around Y
    float angle = uTime * 0.08;
    float cosA = cos(angle);
    float sinA = sin(angle);
    float x = modelPosition.x * cosA - modelPosition.z * sinA;
    float z = modelPosition.x * sinA + modelPosition.z * cosA;
    modelPosition.x = x;
    modelPosition.z = z;

    // Subtle pulse per particle
    float pulse = sin(uTime * 0.6 + aRandom * 6.28) * 0.08 + 1.0;

    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    // Size attenuation
    gl_PointSize = aSize * uPixelRatio * pulse * (1.0 / -viewPosition.z) * 45.0;
    gl_PointSize = max(gl_PointSize, 1.0);

    vColor = color;
    // Fade distant particles
    float dist = length(position.xz);
    vAlpha = smoothstep(2.5, 0.5, dist) * 0.85 + 0.15;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Soft circular point
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float strength = 1.0 - smoothstep(0.0, 0.5, d);
    strength = pow(strength, 1.5);

    gl_FragColor = vec4(vColor, strength * vAlpha);
  }
`;

const ParticleGalaxy = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.2, 3.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Galaxy geometry
    const count = 4000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count);

    const innerColor = new THREE.Color(0.83, 0.69, 0.33);
    const outerColor = new THREE.Color(0.45, 0.37, 0.18);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const radius = Math.random() * 2.5;
      const spinAngle = radius * 4;
      const branchAngle = ((i % 3) / 3) * Math.PI * 2;
      const spread = Math.pow(Math.random(), 3) * 0.5;

      const rx = (Math.random() - 0.5) * spread * 2;
      const ry = (Math.random() - 0.5) * spread;
      const rz = (Math.random() - 0.5) * spread * 2;

      positions[i3] = Math.cos(branchAngle + spinAngle) * radius + rx;
      positions[i3 + 1] = ry;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + rz;

      const mixRatio = radius / 2.5;
      const c = innerColor.clone().lerp(outerColor, mixRatio);
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;

      sizes[i] = 0.5 + Math.random() * 3.0;
      randoms[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Mouse interactivity
    let mouseX = 0, mouseY = 0;
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    container.addEventListener("mousemove", onMouseMove);

    // Resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // Animation loop
    const clock = new THREE.Clock();
    let raf: number;
    const loop = () => {
      const elapsed = clock.getElapsedTime();
      material.uniforms.uTime.value = elapsed;

      // Subtle camera sway based on mouse
      camera.position.x += (mouseX * 0.3 - camera.position.x) * 0.02;
      camera.position.y += (1.2 - mouseY * 0.2 - camera.position.y) * 0.02;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mousemove", onMouseMove);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ opacity: 0.7, pointerEvents: "auto" }}
    />
  );
};

export default ParticleGalaxy;
