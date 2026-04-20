import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const PARTICLE_COUNT = 3000;
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, composer: EffectComposer;
let particlesMesh: THREE.InstancedMesh;
let dummy = new THREE.Object3D();
let photoMeshes: THREE.Group[] = [];
let orbitLight1: THREE.PointLight;
let orbitLight2: THREE.PointLight;
let topStar: THREE.Mesh;
let galaxyParticles: THREE.Points;

// App state
let currentShape = 'heart'; 
let baseShape = 'heart';
let targetPositions: THREE.Vector3[] = [];
let currentPositions: THREE.Vector3[] = [];
let handRotation = { x: 0, y: 0 };
let pinchZoomFocus: THREE.Vector3 | null = null;
let cameraBaseZ = 12;
let animationFrameId: number;
let camSensitivity = 2.0;

// Global brightness controls for React-to-ThreeJS bridge
let storedGathered = 2.5;
let storedScatter = 6.5;
try {
    if (localStorage.getItem('gatheredBright')) storedGathered = parseFloat(localStorage.getItem('gatheredBright')!);
    if (localStorage.getItem('scatterBright')) storedScatter = parseFloat(localStorage.getItem('scatterBright')!);
} catch(e) {}
let globalGatheredBrightness = storedGathered;
let globalScatterBrightness = storedScatter;
let mainAmbientLight: THREE.AmbientLight;
let bloomPass: any; // Global bloom pass reference
let currentPhotoIndex = 0;
let lastPinchTime = 0;
let gestureHistory: string[] = [];

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<'en' | 'zh'>('zh'); 
  const [gestureCommand, setGestureCommand] = useState('initCamera');
  const [showText, setShowText] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [blessings, setBlessings] = useState<string[]>([
    "祝我老哥幸幸福福的", 
    "祝你们永远幸福！",
    "Forever Love 💖",
    "新婚快乐，甜甜蜜蜜！"
  ]);
  const [newBlessing, setNewBlessing] = useState("");
  const [sensitivityVal, setSensitivityVal] = useState(2.0);
  const [gatheredBright, setGatheredBright] = useState(globalGatheredBrightness);
  const [scatterBright, setScatterBright] = useState(globalScatterBrightness);
  const [showControls, setShowControls] = useState(false);

  const triggerAction = (activeGesture: string) => {
    if (activeGesture === 'open_palm') {
        if (currentShape !== 'scatter') updateTargetShape('scatter');
        setShowText(true);
        setGestureCommand('explosion');
        pinchZoomFocus = null;
    } else if (activeGesture === 'closed_fist') {
        if (currentShape !== baseShape) updateTargetShape(baseShape); 
        setShowText(false);
        setGestureCommand('gathering');
        pinchZoomFocus = null;
    } else if (activeGesture === 'pinch') {
        setGestureCommand('pinching');
        if (photoMeshes.length > 0) {
            pinchZoomFocus = photoMeshes[0].position.clone();
        }
    } else {
        setShowText(false);
        setGestureCommand('tracking');
        pinchZoomFocus = null;
    }
  };

  const translations = {
    en: {
      appTitle: "Leave your blessings before you go?",
      liveFeed: "Live Feed: Tracking Hand",
      gestures: {
        openPalm: "Open Palm",
        explodeNebula: "Bloom of Love",
        closedFist: "Closed Fist",
        gatherTree: "Cohesion of Love",
        pinchZoom: "Pinch Zoom",
        inspectPolaroid: "Bits of Happiness"
      },
      controls: {
        title: "Controls",
        uploadImage: "Upload Image",
        treeShape: "Wedding Dress",
        heartShape: "Heart Frame",
        ringShape: "Diamond Ring",
        switchLang: "中文版",
        leaveBlessing: "Leave a Blessing",
        send: "Send"
      },
      footer: {
        engine: "Engine",
        vision: "Vision",
        copyright: "CREATIVE TECHNOLOGIST LAB"
      },
      loadingText: "Initializing Aether...",
      merryChristmas: "HAPPY WEDDING",
      commands: {
        initCamera: "Initialize Camera",
        loadingML: "Loading ML Models...",
        startingCamera: "Starting Camera...",
        ready: "Ready: Show your hand",
        explosion: "Blooming Love!",
        gathering: "Gathering Heart...",
        pinching: "Pinching Photo",
        tracking: "Tracking Hand",
        error: "Camera access denied or error",
        manualMode: "Manual Mode Active"
      }
    },
    zh: {
      appTitle: "不留下你的祝福再走吗？",
      liveFeed: "实时画面：手部监测中",
      gestures: {
        openPalm: "张开手掌",
        explodeNebula: "爱的绽放",
        closedFist: "紧握拳头",
        gatherTree: "爱的凝聚",
        pinchZoom: "指尖捏合",
        inspectPolaroid: "幸福的点点滴滴"
      },
      controls: {
        title: "控制参数",
        uploadImage: "上传纪念照",
        treeShape: "新娘裙摆 (Tree)",
        heartShape: "全息爱心 (Heart)",
        ringShape: "璀璨星环 (Ring)",
        switchLang: "English",
        leaveBlessing: "写下您的祝福...",
        send: "发送祝福"
      },
      footer: {
        engine: "渲染引擎",
        vision: "视觉检测",
        copyright: "创意技术实验室"
      },
      loadingText: "虚拟空间初始化中...",
      merryChristmas: "永 浴 爱 河",
      commands: {
        initCamera: "启动相机中",
        loadingML: "正在加载机器学习核心...",
        startingCamera: "调用摄像头...",
        ready: "已就绪：请展示手势或按按钮",
        explosion: "爱意在此刻绽放！",
        gathering: "浪漫正在凝聚...",
        pinching: "光影聚焦中",
        tracking: "手势捕捉中",
        error: "未开启相机，已进入手动模式",
        manualMode: "已切换为按键模式"
      }
    }
  };

  const t = translations[language];

  // Pre-load all wedding photos from /photos/ at startup (waits for all to finish)
  const loadPresetPhotos = (): Promise<void> => {
    const photoFiles = [
      '/photos/lg1.jpg','/photos/lg2.jpg','/photos/lg3.jpg','/photos/lg4.jpg',
      '/photos/lg5.jpg','/photos/lg6.jpg','/photos/lg7.jpg','/photos/lg8.jpg',
      '/photos/lg9.jpg','/photos/lg10.jpg','/photos/lg11.jpg','/photos/lg12.jpg',
      '/photos/lg13.jpg','/photos/lg14.jpg','/photos/lg15.jpg','/photos/lg16.jpg',
      '/photos/lg17.jpg','/photos/lg18.jpg',
    ];
    const loadPhoto = (url: string): Promise<void> => new Promise((resolve) => {
      const group = new THREE.Group();
      const frameGeo = new THREE.BoxGeometry(3.5, 4.2, 0.1);
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xffd700, roughness: 0.3, metalness: 0.8, fog: false
      });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      group.add(frame);
      const photoGeo = new THREE.PlaneGeometry(3, 3);
      const photoMat = new THREE.MeshBasicMaterial({ color: 0x333333, fog: false });
      const photo = new THREE.Mesh(photoGeo, photoMat);
      photo.position.set(0, 0.4, 0.06);
      group.add(photo);
      group.position.set(0, 0, -50);
      scene.add(group);
      photoMeshes.push(group);
      const tl = new THREE.TextureLoader();
      tl.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          photo.material = new THREE.MeshBasicMaterial({ map: texture, fog: false });
          resolve();
        },
        undefined,
        () => { resolve(); } // still resolve even on error so promise chain doesn't hang
      );
    });
    return Promise.all(photoFiles.map(loadPhoto)) as Promise<void>;
  };

  useEffect(() => {
    initThreeJS();
    loadPresetPhotos().then(() => initMediaPipe());

    const handleResize = () => {
      if (!camera || !renderer || !composer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (renderer) {
        renderer.dispose();
      }
    };
  }, []);

  const initThreeJS = () => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.015); // Less dense so deep galaxy is visible

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1500);
    camera.position.set(0, 2, cameraBaseZ);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    if (containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(renderer.domElement);
    }

    // Post processing
    const renderScene = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.90; // Set high threshold so standard objects (like photos) do NOT bloom
    bloomPass.strength = 2.5; // High strength for elements that DO exceed threshold (HDR particles)
    bloomPass.radius = 0.8;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // Milky Way Galaxy Background (360 degrees, enhanced brightness, massive colorful nebula)
    const galaxyGeo = new THREE.BufferGeometry();
    const galaxyCount = 25000;
    const posArray = new Float32Array(galaxyCount * 3);
    const colorArrayGalaxy = new Float32Array(galaxyCount * 3);
    const glxColor = new THREE.Color();
    for(let i=0; i<galaxyCount; i++) {
        let x, y, z;
        if (Math.random() < 0.50) {
             // Deep Massive Nebula Core directly at the end of the road
             z = -150 - Math.random() * 600;
             const spread = 80 + Math.abs(z + 150) * 0.7; // Huge spread in the distance
             const angle = Math.random() * Math.PI * 2;
             x = Math.cos(angle) * spread * Math.random();
             y = Math.sin(angle) * spread * 0.6 * Math.random(); 
             
             // Vibrant Rose Pink, Royal Blue, Warm Orange gradient.
             // Adding more diamond-like bright whites inside the nebula
             const colMix = Math.random();
             if (colMix < 0.30) glxColor.setHex(0xff3366); // Rich Rose Pink
             else if (colMix < 0.60) glxColor.setHex(0x1a4bfc); // Deep Royal Blue
             else if (colMix < 0.90) glxColor.setHex(0xff8c00); // Super Warm Orange
             else glxColor.setHex(0xffffff); // Diamond white embedded stars
        } else if (Math.random() < 0.65) {
            // uniform sphere around the user
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const r = 80 + Math.random() * 120;
            x = Math.sin(phi) * Math.cos(theta) * r;
            y = Math.cos(phi) * r;
            z = Math.sin(phi) * Math.sin(theta) * r;
             // Galaxy colors
             const mix = Math.random();
             if (mix < 0.25) glxColor.setHex(0xb3e5fc); 
             else if (mix < 0.5) glxColor.setHex(0xffffff);
             else if (mix < 0.75) glxColor.setHex(0x311b92); 
             else glxColor.setHex(0xffa000);
        } else {
            // epic milky way band, tilted 30 degrees
            const angle = Math.random() * Math.PI * 2;
            const tilt = Math.PI / 6; 
            const width = (Math.random() - 0.5) * 60;
            const bx = Math.cos(angle) * (90 + Math.random()*60);
            const bz = Math.sin(angle) * (90 + Math.random()*60);
            const by = width + Math.sin(angle * 3) * 8;
            
            y = by * Math.cos(tilt) - bz * Math.sin(tilt);
            z = by * Math.sin(tilt) + bz * Math.cos(tilt);
            x = bx;
            
            // Galaxy colors
            const mix = Math.random();
            if (mix < 0.25) glxColor.setHex(0xb3e5fc); 
            else if (mix < 0.5) glxColor.setHex(0xffffff);
            else if (mix < 0.75) glxColor.setHex(0x311b92); 
            else glxColor.setHex(0xffa000);
        }
        
        posArray[i*3] = x;
        posArray[i*3+1] = y; 
        posArray[i*3+2] = z;

        // Over-drive HDR values so the Milky Way can trigger high-threshold bloom 
        colorArrayGalaxy[i*3] = Math.min(glxColor.r * 6.0, 10.0);
        colorArrayGalaxy[i*3+1] = Math.min(glxColor.g * 6.0, 10.0);
        colorArrayGalaxy[i*3+2] = Math.min(glxColor.b * 6.0, 10.0);
    }
    galaxyGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    galaxyGeo.setAttribute('color', new THREE.BufferAttribute(colorArrayGalaxy, 3));
    
    const galaxyMat = new THREE.PointsMaterial({
        size: 0.25, // Doubled size for brightness
        vertexColors: true,
        transparent: true,
        opacity: 0.9, // Brighter
        blending: THREE.AdditiveBlending,
        fog: false // Ensure deep universe is never hidden by front fog
    });
    galaxyParticles = new THREE.Points(galaxyGeo, galaxyMat);
    scene.add(galaxyParticles);

    // Particles (Dress -> Gems)
    const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08); 
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x111111, // Reduced to prevent washing out original shapes
      roughness: 0.1,
      metalness: 0.8,
    });

    particlesMesh = new THREE.InstancedMesh(geometry, material, PARTICLE_COUNT);
    const colorArray = new Float32Array(PARTICLE_COUNT * 3);
    particlesMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    scene.add(particlesMesh);

    // Initial positions
    targetPositions = [];
    currentPositions = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        currentPositions.push(new THREE.Vector3(0, 0, 0));
        targetPositions.push(new THREE.Vector3(0, 0, 0));
    }
    updateTargetShape('heart');

    // Lights
    mainAmbientLight = new THREE.AmbientLight(0xffffff, globalGatheredBrightness); 
    scene.add(mainAmbientLight);

    const mainSpotLight = new THREE.SpotLight(0xffffff, 8, 60, Math.PI / 4, 0.5, 1.5); 
    mainSpotLight.position.set(0, 15, 10);
    mainSpotLight.lookAt(0, 0, 0);
    scene.add(mainSpotLight);

    orbitLight1 = new THREE.PointLight(0xffb6c1, 8, 25); // Light Pink
    scene.add(orbitLight1);

    orbitLight2 = new THREE.PointLight(0xffd700, 6, 20); // Soft Gold
    scene.add(orbitLight2);

    // Top Star / Diamond
    const starGeometry = new THREE.OctahedronGeometry(0.3, 0);
    const starMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffe4e1,
      emissiveIntensity: 6.0 // Very bright to trigger new bloom threshold
    });
    topStar = new THREE.Mesh(starGeometry, starMaterial);
    topStar.position.set(0, 4.5, 0);
    scene.add(topStar);

    animate();
  };

  const updateTargetShape = (shape: string) => {
    currentShape = shape;
    if (shape !== 'scatter') baseShape = shape;
    
    // color themes
    const pinks = [0xffb6c1, 0xff69b4, 0xff1493, 0xffca28, 0xffffff]; // enriched heart colors
    const blueGolds = [0x0d47a1, 0x1976d2, 0x00bcd4, 0xffd700, 0xffffff]; // rich blue & gold
    const whiteDressColors = [0xffffff, 0xf8f9fa, 0xfffaf0, 0xe0e5ec, 0xf0f8ff]; // Pure white, pearl, diamond
    
    const getBaseColor = (s: string) => {
        if (s === 'tree') return whiteDressColors[Math.floor(Math.random() * whiteDressColors.length)];
        if (s === 'ring') return blueGolds[Math.floor(Math.random() * blueGolds.length)];
        return pinks[Math.floor(Math.random() * pinks.length)];
    };
    
    const color = new THREE.Color();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let v = new THREE.Vector3();
      if (shape === 'tree') {
        // Dramatic pure white wedding dress blowing backwards
        const dy = (Math.random() * 8.0) - 4; // -4 to +4
        let radius = 0.5;
        let dz = 0;
        let dx = 0;
        
        if (dy > 1.5) {
            radius = 0.25 + (4.0 - dy) * 0.2; // Bodice
        } else if (dy > 0) {
            radius = 0.4 - (1.5 - dy) * 0.1; // Waist
        } else {
            // Massive fanning train blowing wildly
            const depth = Math.pow(Math.abs(dy), 1.6);
            radius = 0.5 + depth * 0.8;
            dz = -depth * 2.5; // Train blows deeply backward
            dx = (Math.random() - 0.5) * depth * 3.5; // Fanning out left and right
        }
        
        const theta = Math.random() * Math.PI * 2;
        // Shift tree down by 1.5 units so it is more centered in the UI
        v.set(Math.cos(theta) * radius + dx, dy - 1.5, Math.sin(theta) * radius + dz);
        color.setHex(getBaseColor('tree'));
      } else if (shape === 'scatter') {
        // Epic Astro-photography Road to the Galaxy
        const t = Math.random();
        const z = 15 - t * 150; // Extend perfectly for smooth back-to-front wrapping (15 down to -135)
        const pathCenter = 0; // Perfectly straight road in the center
        
        let x = 0, y = 0;
        const typeRand = Math.random();
        
        if (typeRand < 0.35) { 
            // The Road (dense, low)
            const spread = (Math.random() - 0.5) * 14; 
            x = pathCenter + spread;
            y = -8 + Math.abs(spread) * 0.15; // Removed z curve to prevent discontinuity on wrap
            
            // Road ONLY reflects silver/white now (no nebula colors)
            color.setHex(Math.random() > 0.4 ? 0xffffff : 0xe0e5ec); 
        } else if (typeRand < 0.65) { 
            // Left Mountains
            const dist = 5 + Math.random() * 30; // brought slightly closer
            x = pathCenter - dist;
            const mountainHeight = 25 + Math.random() * 25; // made taller and more imposing
            y = -8 + Math.random() * mountainHeight; // Removed out-of-sync curve
            color.setHex(getBaseColor(baseShape)); // Keep base shape colors
        } else { 
            // Right Mountains
            const dist = 5 + Math.random() * 30;
            x = pathCenter + dist;
            const mountainHeight = 25 + Math.random() * 25;
            y = -8 + Math.random() * mountainHeight; 
            color.setHex(getBaseColor(baseShape)); // Keep base shape colors
        }
        
        if (Math.random() < 0.20) { // Floating magic dust (increased density)
             y += 4 + Math.random() * 30;
             x += (Math.random() - 0.5) * 35;
             color.setHex(getBaseColor(baseShape));
        }
        v.set(x, y, z);
      } else if (shape === 'heart') {
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 50) {
            const hx = (Math.random() - 0.5) * 3;
            const hy = (Math.random() - 0.5) * 3;
            const hz = (Math.random() - 0.5) * 3;
            const mx = hx, my = hz, mz = hy;
            const term1 = mx*mx + 2.25*my*my + mz*mz - 1;
            const val = term1*term1*term1 - mx*mx*mz*mz*mz - 0.1125*my*my*mz*mz*mz;
            if (val <= 0) {
                valid = true;
                v.set(hx * 3, hy * 3, hz * 3);
            }
            attempts++;
        }
        color.setHex(getBaseColor('heart'));
      } else if (shape === 'ring') {
        const angle = Math.random() * Math.PI * 2;
        const radius = 3.5 + (Math.random() * 1.5);
        v.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 0.7, Math.sin(angle) * radius);
        color.setHex(getBaseColor('ring'));
      }
      
      if (shape !== 'scatter') {
          v.x += (Math.random() - 0.5) * 0.15;
          v.y += (Math.random() - 0.5) * 0.15;
          v.z += (Math.random() - 0.5) * 0.15;
      }
      targetPositions[i].copy(v);
      if (particlesMesh.instanceColor) {
        color.toArray(particlesMesh.instanceColor.array, i * 3);
      }
    }
    if (particlesMesh.instanceColor) {
        particlesMesh.instanceColor.needsUpdate = true;
    }
  };

  const initMediaPipe = async () => {
    setGestureCommand('loadingML');
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });

      setGestureCommand('startingCamera');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          
          let lastVideoTime = -1;
          const processVideo = () => {
            if (
              videoRef.current && 
              videoRef.current.currentTime !== lastVideoTime && 
              videoRef.current.videoWidth > 0 && 
              videoRef.current.videoHeight > 0
            ) {
              lastVideoTime = videoRef.current.currentTime;
              const results = handLandmarker.detectForVideo(videoRef.current, performance.now());
              if (results.landmarks && results.landmarks.length > 0) {
                handleGestures(results.landmarks[0]);
              }
            }
            requestAnimationFrame(processVideo);
          };
          processVideo();
          setLoading(false);
          setGestureCommand('ready');
        };
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
      setGestureCommand('error');
    }
  };

  const handleGestures = (landmarks: any[]) => {
    // Robust heuristics for gestures using relative distances
    const d = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const thumbDist = d(landmarks[4], landmarks[8]);
    
    const wrist = landmarks[0];
    // Compare fingertip distance from wrist vs knuckle distance from wrist
    const isIndexExtended = d(landmarks[8], wrist) > d(landmarks[5], wrist) * 1.3;
    const isMiddleExtended = d(landmarks[12], wrist) > d(landmarks[9], wrist) * 1.3;
    const isRingExtended = d(landmarks[16], wrist) > d(landmarks[13], wrist) * 1.3;
    const isPinkyExtended = d(landmarks[20], wrist) > d(landmarks[17], wrist) * 1.3;

    const extendedCount = [isIndexExtended, isMiddleExtended, isRingExtended, isPinkyExtended].filter(Boolean).length;
    
    let activeGesture = 'none';
    if (extendedCount === 4 && thumbDist > 0.12) activeGesture = 'open_palm'; 
    else if (extendedCount <= 1 && thumbDist > 0.05) activeGesture = 'closed_fist';
    // Relaxed pinch constraints: larger distance allowed, less strict on other fingers
    else if (thumbDist < 0.06 && !isPinkyExtended) activeGesture = 'pinch';

    // Debounce to prevent flickering and unstable toggles while hand is moving
    gestureHistory.push(activeGesture);
    if (gestureHistory.length > 10) gestureHistory.shift();

    // Make pinch trigger easier: if 6/10 recent frames are pinch, it's a pinch
    let stableGesture = 'none';
    const pinchCount = gestureHistory.filter(g => g === 'pinch').length;
    if (pinchCount >= 6) {
        stableGesture = 'pinch';
    } else {
        stableGesture = gestureHistory.every(g => g === activeGesture) ? activeGesture : 'none';
    }

    if (stableGesture === 'pinch') {
        const now = Date.now();
        if (now - lastPinchTime > 1500 && photoMeshes.length > 0) {
            currentPhotoIndex = (currentPhotoIndex + 1) % photoMeshes.length;
            lastPinchTime = now;
            triggerAction('pinch');
        }
    } else if (stableGesture !== 'none') {
        triggerAction(stableGesture);
    } else {
        triggerAction('none'); // Safe fallback to tracking
    }

    // Rotate camera based on hand center
    const handX = (landmarks[9].x - 0.5) * 2; // -1 to 1
    const handY = (landmarks[9].y - 0.5) * 2;
    // Map with stable, reduced base sensitivity so it's not twitchy
    handRotation.x = handX * Math.PI * 0.15 * camSensitivity;
    handRotation.y = -handY * Math.PI * 0.1 * camSensitivity;
  };

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);

    // Lerp particles
    for (let i = 0; i < PARTICLE_COUNT && i < targetPositions.length; i++) {
        if (currentShape === 'scatter') {
            targetPositions[i].z += 0.025; // Much slower, majestic drift
            if (targetPositions[i].z > 15) {
                targetPositions[i].z -= 150; // Wrap back to the end of the road
            }
        }

        currentPositions[i].lerp(targetPositions[i], 0.05); // Faster lerp for more dynamic feel
        dummy.position.copy(currentPositions[i]);
        // add slight rotation
        dummy.rotation.x += 0.01;
        dummy.rotation.y += 0.02;
        dummy.updateMatrix();
        particlesMesh.setMatrixAt(i, dummy.matrix);
    }
    particlesMesh.instanceMatrix.needsUpdate = true;

    const time = performance.now() * 0.001;

    if (galaxyParticles) {
        // Stop spinning the galaxy 'y' so the nebula stays permanently at the end of the road
        galaxyParticles.rotation.y = 0; 
        galaxyParticles.rotation.z = Math.sin(time * 0.02) * 0.1;
    }

    if (bloomPass) {
        bloomPass.strength = 2.5; // Constant new bloom strength
    }
    
    if (mainAmbientLight) {
        const targetBrightness = currentShape === 'scatter' ? globalScatterBrightness : globalGatheredBrightness;
        mainAmbientLight.intensity += (targetBrightness - mainAmbientLight.intensity) * 0.05;
    }

    // Dynamic Lights & Star pulsing
    if (orbitLight1 && orbitLight2) {
        orbitLight1.position.x = Math.sin(time * 0.8) * 4;
        orbitLight1.position.z = Math.cos(time * 0.8) * 4;
        orbitLight1.position.y = Math.sin(time * 1.5) * 2 + 1;

        orbitLight2.position.x = Math.cos(time * 0.5) * 5;
        orbitLight2.position.z = Math.sin(time * 0.5) * 5;
        orbitLight2.position.y = Math.cos(time * 1.2) * 3;
    }
    if (topStar) {
        (topStar.material as THREE.MeshStandardMaterial).emissiveIntensity = 5.0 + Math.sin(time * 3) * 2.0;
        topStar.rotation.y += 0.02;
    }

    // Camera movement
    const targetCamPos = new THREE.Vector3(
        Math.sin(handRotation.x) * cameraBaseZ,
        2 + Math.sin(handRotation.y) * 5,
        Math.cos(handRotation.x) * cameraBaseZ
    );

    camera.lookAt(0, 0, 0);
    camera.position.lerp(targetCamPos, 0.05);

    // Gallery depth transition & floating for photos
    const totalPhotos = photoMeshes.length;
    photoMeshes.forEach((mesh, idx) => {
        let targetZ = 0;
        let targetX = 0;
        let targetY = 0;
        let targetRotY = Math.sin(time * 0.5 + idx) * 0.1;
        
        // Photos should ONLY be visible in the scatter mode
        const shouldBeVisible = currentShape === 'scatter';
        mesh.visible = shouldBeVisible;

        if (currentShape === 'scatter') {
           // Fully automatic continuous gallery flowing towards the user
           const spacing = 35; // Put back to 35 so they are not too clustered
           const visibleRange = Math.max(totalPhotos * spacing, 200); // 200 deep into the nebula min
           
           // Synchronize with the road movement speed (z += 0.025 per frame => ~1.5 per sec)
           // Slightly faster than road, but not too fast
           const scrollProgress = time * 2.5; 
           
           // Calculate wrapped Z position 
           // Moving forward means Z position is increasing towards +15
           let rawZ = ((totalPhotos - idx) * spacing + scrollProgress) % visibleRange;
           
           // Map to visual coordinates: Start deep in nebula (-visibleRange + 15), end at camera (+15)
           targetZ = rawZ - (visibleRange - 15);
           

           // Base elevation matches the road, slightly higher the further they are to match perspective
           const distFromCam = Math.max(0, 15 - targetZ);
           targetY = -2 + distFromCam * 0.025; 
           
           // Make them closer to the road (10.0 units) 
           targetX = idx % 2 === 0 ? -10.0 : 10.0;
           
           // Make them turn their face INWARDS significantly more (0.25 rad instead of 0.07 rad)
           // so you can actually see the photo face when it gets close.
           targetRotY = idx % 2 === 0 ? Math.PI * 0.25 : -Math.PI * 0.25;
           
           // Make them MASSIVE in this view so you can clearly see them!
           mesh.scale.x += (2.8 - mesh.scale.x) * 0.05;
           mesh.scale.y += (2.8 - mesh.scale.y) * 0.05;
           mesh.scale.z += (2.8 - mesh.scale.z) * 0.05;
        } else {
            // Original gathered shape gallery logic
            mesh.scale.x += (1.0 - mesh.scale.x) * 0.05;
            mesh.scale.y += (1.0 - mesh.scale.y) * 0.05;
            mesh.scale.z += (1.0 - mesh.scale.z) * 0.05;
            
            if (idx < currentPhotoIndex) {
                targetZ = 15 + (currentPhotoIndex - idx) * 10;
                targetX = (idx % 2 === 0 ? -15 : 15);
                targetY = 5;
            } else if (idx === currentPhotoIndex) {
                targetZ = -1.5;
                targetX = 0;
                targetY = 0.4;
            } else {
                const dist = (idx - currentPhotoIndex);
                targetZ = -15 - dist * 25; 
                targetX = 0; 
                targetY = -3 + dist * 2.5; 
            }
        }

        mesh.position.x += (targetX - mesh.position.x) * 0.05;
        mesh.position.y += (targetY - mesh.position.y) * 0.05;
        
        // If jumping from the camera front (wrapped around) back to the deep nebula, snap instantly
        if (currentShape === 'scatter' && targetZ < -100 && mesh.position.z > 5) {
            mesh.position.z = targetZ;
        } else {
            mesh.position.z += (targetZ - mesh.position.z) * 0.05;
        }
        
        let diffRot = targetRotY - mesh.rotation.y;
        while(diffRot > Math.PI) diffRot -= Math.PI * 2;
        while(diffRot < -Math.PI) diffRot += Math.PI * 2;
        mesh.rotation.y += diffRot * 0.05;
    });

    composer.render();
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const group = new THREE.Group();
      
      const frameGeo = new THREE.BoxGeometry(3.5, 4.2, 0.1);
      const frameMat = new THREE.MeshStandardMaterial({ 
        color: 0xffd700, roughness: 0.3, metalness: 0.8, fog: false 
      });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      group.add(frame);
      
      const photoGeo = new THREE.PlaneGeometry(3, 3);
      if (file.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.src = url;
          video.crossOrigin = 'anonymous';
          video.muted = true;
          video.loop = true;
          video.play();
          const texture = new THREE.VideoTexture(video);
          texture.colorSpace = THREE.SRGBColorSpace;
          // BasicMaterial completely ignores all light and glow mapping, fog: false saves it from darkening far away
          const photoMat = new THREE.MeshBasicMaterial({ map: texture, fog: false });
          const photo = new THREE.Mesh(photoGeo, photoMat);
          photo.position.set(0, 0.4, 0.06);
          group.add(photo);
          group.position.set(0, 0, -50); 
          scene.add(group);
          photoMeshes.push(group);
      } else {
          const tl = new THREE.TextureLoader();
          tl.load(url, (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace;
              // BasicMaterial completely ignores all light and glow mapping, fog: false prevents distant fade
              const photoMat = new THREE.MeshBasicMaterial({ map: texture, fog: false });
              const photo = new THREE.Mesh(photoGeo, photoMat);
              photo.position.set(0, 0.4, 0.06);
              group.add(photo);
              group.position.set(0, 0, -50); 
              scene.add(group);
              photoMeshes.push(group);
          });
      }
    });
  };

  const handleAddBlessing = (e: React.FormEvent) => {
    e.preventDefault();
    if(newBlessing.trim()) {
      setBlessings(prev => [...prev, newBlessing]);
      setNewBlessing("");
      // Automatically trigger bloom of love to show the new blessing!
      triggerAction('open_palm');
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden text-white font-[Helvetica_Neue,Helvetica,Arial,sans-serif]" style={{ background: '#000000' }}>
      <style>{`
        @keyframes gentleFloat {
          0% { transform: translateY(100vh) scale(0.8); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% { transform: translateY(-50vh) scale(1.1); opacity: 0; }
        }
        .blessing-particle {
          animation: gentleFloat linear forwards;
        }
      `}</style>
      <div ref={containerRef} className="absolute inset-0 z-0" />
      
      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-end px-10 py-6 border-b border-white/10 z-20 pointer-events-none">
        <div className="font-['Georgia',serif] text-[20px] tracking-[0.2em] uppercase text-[#ffb6c1]">
          {t.appTitle}
        </div>
        <div className="text-[10px] tracking-[0.1em] uppercase bg-[#ffb6c1]/10 px-3 py-1 border border-[#ffb6c1] rounded-full text-[#ffb6c1]">
          {t.commands[gestureCommand as keyof typeof t.commands] || gestureCommand}
        </div>
      </header>

      {/* Camera Overlay */}
      <div className="absolute left-10 bottom-10 w-[200px] h-[120px] bg-[#111] border border-white/15 flex flex-col z-20">
        <div className="flex-1 relative overflow-hidden bg-[radial-gradient(circle,#222_0%,#000_100%)]">
             <video 
                ref={videoRef} 
                className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" 
                playsInline 
                muted 
                style={{ transform: 'scaleX(-1)' }}
            />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60px] h-[60px] border border-dashed border-[#ffd700]/50 rounded-full" />
        </div>
        <div className="p-2 text-[9px] text-[#666] uppercase tracking-wider">{t.liveFeed}</div>
      </div>

      {/* Interaction Guide & Manual Fallback Hooks */}
      <div className="absolute left-10 top-[100px] z-20 pointer-events-auto">
        <button onClick={() => triggerAction('open_palm')} className="block mb-8 border-l border-[#ffb6c1] pl-4 text-left hover:bg-white/5 transition-colors p-2 -ml-2 rounded w-full">
            <div className="text-[14px] font-light mb-1 text-[#ffb6c1]">{t.gestures.openPalm}</div>
            <div className="text-[11px] text-[#888] uppercase tracking-[0.05em]">{t.gestures.explodeNebula}</div>
        </button>
        <button onClick={() => triggerAction('closed_fist')} className="block mb-8 border-l border-[#ffb6c1] pl-4 text-left hover:bg-white/5 transition-colors p-2 -ml-2 rounded w-full">
            <div className="text-[14px] font-light mb-1 text-[#ffb6c1]">{t.gestures.closedFist}</div>
            <div className="text-[11px] text-[#888] uppercase tracking-[0.05em]">{t.gestures.gatherTree}</div>
        </button>
      </div>

      {/* Toggle Controls Button positioned at bottom right above footer */}
      <button 
        onClick={() => setShowControls(prev => !prev)} 
        className="absolute right-10 bottom-16 z-30 p-2 text-[#ffb6c1] hover:bg-[#ffb6c1]/10 rounded-full transition-all backdrop-blur-md border border-[#ffb6c1]/30 flex items-center justify-center cursor-pointer pointer-events-auto"
      >
         <svg width="24" height="24" viewBox="0 0 24 24" fill={showControls ? "#ffb6c1" : "none"} stroke="#ffb6c1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
         </svg>
      </button>

      {/* Control Panel */}
      {showControls && (
        <>
          <div className="absolute right-10 top-[100px] w-[240px] bg-[#0a0a0a]/80 backdrop-blur-md border border-[#ffb6c1]/20 p-6 z-20 flex flex-col gap-4 pointer-events-auto overflow-y-auto max-h-[70vh]">
            <span className="text-[10px] uppercase text-[#ffb6c1] tracking-[0.1em] block mb-2">{t.controls.title}</span>
            
            <label className="cursor-pointer bg-transparent border border-[#ffb6c1]/20 text-[#999] hover:text-[#ffb6c1] hover:border-[#ffb6c1]/50 text-[11px] text-center px-4 py-3 transition-colors uppercase tracking-wider block">
              <span>{t.controls.uploadImage}</span>
              <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handlePhotoUpload} />
            </label>
            
            <form onSubmit={handleAddBlessing} className="flex flex-col gap-2 mt-2">
               <input 
                 type="text" 
                 value={newBlessing}
                 onChange={e => setNewBlessing(e.target.value)}
                 placeholder={t.controls.leaveBlessing}
                 className="bg-black/50 border border-[#ffb6c1]/20 text-white text-[11px] px-3 py-2 outline-none focus:border-[#ffb6c1]/50 w-full"
               />
               <button type="submit" className="bg-[#ffb6c1]/10 border border-[#ffb6c1]/30 text-[#ffb6c1] hover:bg-[#ffb6c1]/20 text-[11px] px-4 py-2 transition-colors border-dashed tracking-wider w-full">
                 {t.controls.send}
               </button>
            </form>

            <div className="w-full h-px bg-[#ffb6c1]/20 my-2" />

            <button onClick={() => updateTargetShape('tree')} className="bg-transparent border border-[#ffb6c1]/20 text-[#999] hover:text-[#ffb6c1] hover:border-[#ffb6c1]/50 text-[11px] px-4 py-3 transition-colors uppercase tracking-wider">
              {t.controls.treeShape}
            </button>
            <button onClick={() => updateTargetShape('heart')} className="bg-transparent border border-[#ffb6c1]/20 text-[#ffb6c1] hover:text-[#ffb6c1] hover:border-[#ffb6c1]/50 text-[11px] px-4 py-3 transition-colors uppercase tracking-wider">
              {t.controls.heartShape}
            </button>
            <button onClick={() => updateTargetShape('ring')} className="bg-transparent border border-[#ffb6c1]/20 text-[#999] hover:text-[#ffb6c1] hover:border-[#ffb6c1]/50 text-[11px] px-4 py-3 transition-colors uppercase tracking-wider">
              {t.controls.ringShape}
            </button>
            
            <div className="w-full h-px bg-[#ffb6c1]/20 my-2" />

            <div className="flex flex-col gap-2">
                <label className="text-[10px] text-[#ffb6c1]/80 uppercase tracking-wider">聚合时亮度</label>
                <input 
                    type="range" min="0.5" max="5.0" step="0.1" value={gatheredBright}
                    onChange={e => {
                        const v = parseFloat(e.target.value);
                        setGatheredBright(v);
                        globalGatheredBrightness = v;
                        localStorage.setItem('gatheredBright', v.toString());
                    }}
                    className="w-full accent-[#ffb6c1]"
                />
            </div>
            
            <div className="flex flex-col gap-2">
                <label className="text-[10px] text-[#ffb6c1]/80 uppercase tracking-wider">分散时亮度</label>
                <input 
                    type="range" min="0.5" max="8.0" step="0.1" value={scatterBright}
                    onChange={e => {
                        const v = parseFloat(e.target.value);
                        setScatterBright(v);
                        globalScatterBrightness = v;
                        localStorage.setItem('scatterBright', v.toString());
                    }}
                    className="w-full accent-[#ffb6c1]"
                />
            </div>

            <button onClick={() => setLanguage(lang => lang === 'en' ? 'zh' : 'en')} className="bg-transparent border border-[#ffb6c1]/30 text-[#ffb6c1] hover:bg-[#ffb6c1]/10 text-[11px] px-4 py-3 transition-colors uppercase tracking-wider mt-2">
              {t.controls.switchLang}
            </button>
          </div>

          {/* Cupid's Arrow Sensitivity Control */}
          <div className="absolute right-10 bottom-32 z-20 flex flex-col items-end gap-1 pointer-events-auto">
            <label className="text-[9px] text-[#ffb6c1] uppercase tracking-widest px-2 py-1">Camera Sensitivity</label>
            <div className="relative w-32 h-6 flex items-center group">
              <input 
                 type="range" min="0.5" max="5.0" step="0.1" 
                 value={sensitivityVal} 
                 onChange={(e) => {
                     setSensitivityVal(parseFloat(e.target.value));
                     camSensitivity = parseFloat(e.target.value);
                 }}
                 className="w-full absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              {/* Cupid's Arrow visuals */}
              <div className="absolute w-full h-[1px] bg-[#ffb6c1]/30 rounded-full" />
              <div className="absolute h-full flex items-center pointer-events-none transition-all duration-75" style={{ left: `${((sensitivityVal - 0.5) / 4.5) * 100}%`, transform: 'translateX(-50%)' }}>
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffb6c1" strokeWidth="1.5" className="rotate-45 drop-shadow-[0_0_5px_#ffb6c1]">
                   <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
                   {/* Arrow feathers */}
                   <path d="M5 12l3 -3 M5 12l3 3 M7 12l3 -3 M7 12l3 3" strokeLinecap="round" strokeLinejoin="round"/>
                 </svg>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer Metrics */}
      <footer className="absolute bottom-0 left-0 w-full px-10 py-4 flex gap-10 border-t border-[#ffb6c1]/10 text-[10px] text-[#555] tracking-[0.05em] uppercase z-20 bg-black/40 backdrop-blur-sm pointer-events-none">
          <div className="metric"><b className="text-[#888] font-normal mr-1">{t.footer.engine}</b> THREE.JS R160</div>
          <div className="metric"><b className="text-[#888] font-normal mr-1">{t.footer.vision}</b> MEDIAPIPE TASK V0.10.3</div>
          <div className="ml-auto">&copy; {new Date().getFullYear()} {t.footer.copyright}</div>
      </footer>

      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#2a0b15]/90 backdrop-blur-md">
           <div className="text-center">
             <div className="w-16 h-16 border border-[#ffb6c1]/30 border-t-[#ffb6c1] rounded-full animate-spin mx-auto mb-4" />
             <p className="text-[#ffb6c1] tracking-widest uppercase text-xs font-['Georgia',serif]">{t.loadingText}</p>
           </div>
        </div>
      )}

      {showText && (
        <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
          {/* Main Merry Christmas / Wedding Text */}
          <div className="absolute bottom-[10%] left-0 w-full flex items-center justify-center">
            <h2 className="text-[64px] font-['Georgia',serif] text-white opacity-20 uppercase tracking-[0.15em] animate-pulse">
              {t.merryChristmas}
            </h2>
          </div>
          
          {/* Drifting Blessings */}
          {blessings.map((blessing, idx) => {
            const duration = 8 + (Math.random() * 6);
            const delay = Math.random() * 2;
            const left = 10 + (Math.random() * 80);
            return (
              <div 
                key={`${idx}-${blessing}`}
                className="absolute text-[#ffb6c1] text-lg font-['Georgia',serif] tracking-widest blessing-particle whitespace-nowrap opacity-0"
                style={{
                  left: `${left}%`,
                  animationDuration: `${duration}s`,
                  animationDelay: `${delay}s`
                }}
              >
                {blessing}
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}
