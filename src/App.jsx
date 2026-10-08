import React, { useState, useEffect, useRef, useCallback } from 'react';

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================
const GRID_SIZE = 22; // 22x22 grid
const CELL_SIZE = 22; // Canvas logical cell size (pixels)
const CANVAS_DIMENSION = GRID_SIZE * CELL_SIZE; // 484 x 484

const DIFFICULTIES = {
  chill: { label: 'Chill', baseSpeed: 140, color: '#38bdf8' },
  classic: { label: 'Classic', baseSpeed: 100, color: '#00f0ff' },
  turbo: { label: 'Turbo', baseSpeed: 70, color: '#f59e0b' },
  psycho: { label: 'Insane', baseSpeed: 45, color: '#ff007b' },
};

const THEMES = {
  cyberpunk: {
    name: 'Cyberpunk Neon',
    bg: '#0a0d18',
    grid: 'rgba(0, 240, 255, 0.05)',
    snakeHead: '#00f0ff',
    snakeBodyStart: '#00d2ff',
    snakeBodyEnd: '#9d4edd',
    eyeColor: '#ffffff',
    wallColor: '#ff007b',
  },
  matrix: {
    name: 'Matrix Core',
    bg: '#051109',
    grid: 'rgba(0, 255, 102, 0.06)',
    snakeHead: '#00ff66',
    snakeBodyStart: '#10b981',
    snakeBodyEnd: '#064e3b',
    eyeColor: '#ffffff',
    wallColor: '#22c55e',
  },
  synthwave: {
    name: 'Synthwave Sunset',
    bg: '#140c24',
    grid: 'rgba(255, 0, 128, 0.06)',
    snakeHead: '#ffd600',
    snakeBodyStart: '#ff007b',
    snakeBodyEnd: '#7928ca',
    eyeColor: '#ffffff',
    wallColor: '#ffd600',
  },
};

const FOOD_TYPES = {
  apple: { name: 'Apple', points: 10, grow: 1, color: '#ef4444', icon: '🍎', chance: 0.65 },
  golden: { name: 'Golden Berry', points: 35, grow: 2, color: '#ffd600', icon: '⭐', duration: 7000, chance: 0.12 },
  speed: { name: 'Speed Surge', points: 15, grow: 1, color: '#f59e0b', icon: '⚡', power: 'speed', duration: 6000, chance: 0.08 },
  freeze: { name: 'Frost Slow', points: 15, grow: 1, color: '#38bdf8', icon: '❄️', power: 'freeze', duration: 7000, chance: 0.08 },
  shrink: { name: 'Quantum Shrink', points: 25, grow: -3, color: '#a855f7', icon: '✂️', power: 'shrink', duration: 0, chance: 0.07 },
};

// ==========================================
// WEB AUDIO API SOUND SYNTHESIZER
// ==========================================
class SoundController {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
  }

  playTone(freq, type, duration, gainValue = 0.1, pitchBend = 0) {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (pitchBend !== 0) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, freq + pitchBend),
          this.ctx.currentTime + duration
        );
      }

      gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Audio context might be restricted before interaction
    }
  }

  eat() {
    this.playTone(587.33, 'sine', 0.1, 0.15, 300); // D5 chime
  }

  specialEat() {
    this.playTone(659.25, 'triangle', 0.15, 0.2, 400); // E5 to higher
    setTimeout(() => this.playTone(880, 'sine', 0.2, 0.2, 200), 70);
  }

  powerup() {
    this.playTone(440, 'sawtooth', 0.25, 0.12, 500);
  }

  freeze() {
    this.playTone(880, 'sine', 0.3, 0.15, -400);
  }

  shrink() {
    this.playTone(700, 'square', 0.18, 0.1, -300);
  }

  turn() {
    this.playTone(220, 'sine', 0.03, 0.03, 50);
  }

  gameOver() {
    this.playTone(330, 'sawtooth', 0.3, 0.25, -150);
    setTimeout(() => this.playTone(220, 'triangle', 0.4, 0.25, -100), 120);
    setTimeout(() => this.playTone(110, 'sine', 0.6, 0.3, -50), 300);
  }

  highScore() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((note, i) => {
      setTimeout(() => this.playTone(note, 'triangle', 0.25, 0.2), i * 110);
    });
  }
}

const audio = new SoundController();

// Safe Rounded Rectangle Drawing Fallback
function drawRoundedRect(context, x, y, width, height, radius) {
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  } else {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }
}

// ==========================================
// MAIN REACT COMPONENT
// ==========================================
export default function App() {
  // Game States
  const [gameState, setGameState] = useState('IDLE'); // 'IDLE', 'PLAYING', 'PAUSED', 'GAMEOVER'
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('cyber_snake_high_score') || '0', 10);
  });
  const [difficulty, setDifficulty] = useState('classic');
  const [gameMode, setGameMode] = useState('classic'); // 'classic' (walls kill), 'wrap' (portal edges)
  const [theme, setTheme] = useState('cyberpunk');
  const [isMuted, setIsMuted] = useState(false);

  // Active Power-ups state
  const [activePower, setActivePower] = useState(null); // { type: 'speed'|'freeze', expiresAt: timestamp }
  const [powerTimeLeft, setPowerTimeLeft] = useState(0);

  // Stats
  const [combo, setCombo] = useState(1);
  const [stats, setStats] = useState({
    applesEaten: 0,
    specialFoodEaten: 0,
    highestCombo: 1,
    timeElapsed: 0,
  });

  // Canvas & Engine References
  const canvasRef = useRef(null);
  const snakeRef = useRef([
    { x: 10, y: 11 },
    { x: 10, y: 12 },
    { x: 10, y: 13 },
  ]);
  const directionRef = useRef({ x: 0, y: -1 });
  const nextDirectionRef = useRef({ x: 0, y: -1 });
  const foodRef = useRef({ x: 10, y: 5, type: 'apple', spawnTime: Date.now() });
  const particlesRef = useRef([]);
  const floatingTextsRef = useRef([]);
  const lastEatTimeRef = useRef(0);
  const gameLoopRef = useRef(null);
  const lastTickRef = useRef(0);

  // Sync mute state
  useEffect(() => {
    audio.muted = isMuted;
  }, [isMuted]);

  // Handle Power-up countdown
  useEffect(() => {
    if (!activePower) {
      setPowerTimeLeft(0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((activePower.expiresAt - Date.now()) / 1000));
      setPowerTimeLeft(remaining);
      if (Date.now() >= activePower.expiresAt) {
        setActivePower(null);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [activePower]);

  // Update Game Stats Timer
  useEffect(() => {
    let timer;
    if (gameState === 'PLAYING') {
      timer = setInterval(() => {
        setStats((prev) => ({ ...prev, timeElapsed: prev.timeElapsed + 1 }));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState]);

  // Spawn Food Logic
  const spawnFood = useCallback((currentSnake) => {
    const roll = Math.random();
    let selectedType = 'apple';
    let cumulative = 0;

    for (const [key, conf] of Object.entries(FOOD_TYPES)) {
      cumulative += conf.chance;
      if (roll <= cumulative) {
        selectedType = key;
        break;
      }
    }

    let newX, newY;
    let collision;
    do {
      newX = Math.floor(Math.random() * GRID_SIZE);
      newY = Math.floor(Math.random() * GRID_SIZE);
      // eslint-disable-next-line no-loop-func
      collision = currentSnake.some((seg) => seg.x === newX && seg.y === newY);
    } while (collision);

    foodRef.current = {
      x: newX,
      y: newY,
      type: selectedType,
      spawnTime: Date.now(),
    };
  }, []);

  // Visual FX: Particle burst
  const addParticles = (x, y, color, count = 12) => {
    const px = x * CELL_SIZE + CELL_SIZE / 2;
    const py = y * CELL_SIZE + CELL_SIZE / 2;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5);
      const speed = Math.random() * 3 + 1.5;
      particlesRef.current.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: Math.random() * 0.04 + 0.02,
        color: color,
        size: Math.random() * 3.5 + 2,
      });
    }
  };

  // Visual FX: Floating score label
  const addFloatingText = (x, y, text, color) => {
    floatingTextsRef.current.push({
      x: x * CELL_SIZE + CELL_SIZE / 2,
      y: y * CELL_SIZE,
      text,
      color,
      life: 1.0,
      vy: -1.2,
    });
  };

  // Start New Game
  const startGame = () => {
    audio.init();
    const initialSnake = [
      { x: 10, y: 11 },
      { x: 10, y: 12 },
      { x: 10, y: 13 },
    ];
    snakeRef.current = initialSnake;
    directionRef.current = { x: 0, y: -1 };
    nextDirectionRef.current = { x: 0, y: -1 };
    particlesRef.current = [];
    floatingTextsRef.current = [];
    setScore(0);
    setCombo(1);
    setActivePower(null);
    setStats({
      applesEaten: 0,
      specialFoodEaten: 0,
      highestCombo: 1,
      timeElapsed: 0,
    });
    spawnFood(initialSnake);
    setGameState('PLAYING');
    lastTickRef.current = performance.now();
  };

  // Trigger Game Over
  const triggerGameOver = useCallback(() => {
    setGameState('GAMEOVER');
    audio.gameOver();

    // Death explosion particles
    snakeRef.current.forEach((segment) => {
      addParticles(segment.x, segment.y, '#ff007b', 6);
    });

    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('cyber_snake_high_score', score.toString());
      setTimeout(() => audio.highScore(), 350);
    }
  }, [score, highScore]);

  // Process Keyboard Input
  const handleKeyDown = useCallback(
    (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === ' ' || e.key === 'Escape') {
        if (gameState === 'PLAYING') {
          setGameState('PAUSED');
        } else if (gameState === 'PAUSED') {
          setGameState('PLAYING');
        }
        return;
      }

      if (e.key.toLowerCase() === 'r' && (gameState === 'GAMEOVER' || gameState === 'PAUSED')) {
        startGame();
        return;
      }

      if (gameState !== 'PLAYING') return;

      const cur = directionRef.current;
      let newDir = null;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          if (cur.y === 0) newDir = { x: 0, y: -1 };
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          if (cur.y === 0) newDir = { x: 0, y: 1 };
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (cur.x === 0) newDir = { x: -1, y: 0 };
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          if (cur.x === 0) newDir = { x: 1, y: 0 };
          break;
        default:
          break;
      }

      if (newDir) {
        nextDirectionRef.current = newDir;
        audio.turn();
      }
    },
    [gameState]
  );

  // Direction handler for virtual controller
  const handleDirectionChange = (newDir) => {
    if (gameState !== 'PLAYING') return;
    const cur = directionRef.current;
    if (newDir.x !== 0 && cur.x === 0) {
      nextDirectionRef.current = newDir;
      audio.turn();
    } else if (newDir.y !== 0 && cur.y === 0) {
      nextDirectionRef.current = newDir;
      audio.turn();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Main Game Tick (Physics / Move)
  const gameTick = useCallback(() => {
    directionRef.current = nextDirectionRef.current;
    const dir = directionRef.current;
    const snake = [...snakeRef.current];
    const head = { ...snake[0] };

    let nextHead = {
      x: head.x + dir.x,
      y: head.y + dir.y,
    };

    // Mode-specific Wall collisions
    if (gameMode === 'wrap') {
      if (nextHead.x < 0) nextHead.x = GRID_SIZE - 1;
      if (nextHead.x >= GRID_SIZE) nextHead.x = 0;
      if (nextHead.y < 0) nextHead.y = GRID_SIZE - 1;
      if (nextHead.y >= GRID_SIZE) nextHead.y = 0;
    } else {
      // Classic wall collision
      if (
        nextHead.x < 0 ||
        nextHead.x >= GRID_SIZE ||
        nextHead.y < 0 ||
        nextHead.y >= GRID_SIZE
      ) {
        triggerGameOver();
        return;
      }
    }

    // Self collision
    if (snake.some((seg) => seg.x === nextHead.x && seg.y === nextHead.y)) {
      triggerGameOver();
      return;
    }

    // Move snake
    snake.unshift(nextHead);

    // Food collision check
    const food = foodRef.current;
    if (nextHead.x === food.x && nextHead.y === food.y) {
      const foodConfig = FOOD_TYPES[food.type] || FOOD_TYPES.apple;
      const now = Date.now();

      // Combo calculation (within 3.5s)
      let newCombo = 1;
      if (now - lastEatTimeRef.current < 3500) {
        newCombo = Math.min(combo + 1, 5);
      }
      lastEatTimeRef.current = now;
      setCombo(newCombo);
      setStats((prev) => ({
        ...prev,
        highestCombo: Math.max(prev.highestCombo, newCombo),
        applesEaten: prev.applesEaten + 1,
        specialFoodEaten: food.type !== 'apple' ? prev.specialFoodEaten + 1 : prev.specialFoodEaten,
      }));

      // Calculate gained points with combo multiplier
      const earnedScore = foodConfig.points * newCombo;
      setScore((s) => s + earnedScore);

      // Audio & Text FX
      addFloatingText(
        food.x,
        food.y,
        `+${earnedScore}${newCombo > 1 ? ` (x${newCombo})` : ''}`,
        foodConfig.color
      );
      addParticles(food.x, food.y, foodConfig.color, 16);

      // Handle special powers
      if (food.type === 'golden') {
        audio.specialEat();
      } else if (food.type === 'speed') {
        audio.powerup();
        setActivePower({ type: 'speed', expiresAt: now + (foodConfig.duration || 6000) });
      } else if (food.type === 'freeze') {
        audio.freeze();
        setActivePower({ type: 'freeze', expiresAt: now + (foodConfig.duration || 7000) });
      } else if (food.type === 'shrink') {
        audio.shrink();
        // Cut snake length
        const targetLen = Math.max(3, snake.length - 3);
        snake.splice(targetLen);
      } else {
        audio.eat();
      }

      // Handle growth
      if (foodConfig.grow <= 0) {
        snake.pop(); // do not grow if shrink
      }

      spawnFood(snake);
    } else {
      // Normal step: pop tail
      snake.pop();
    }

    snakeRef.current = snake;
  }, [gameMode, combo, spawnFood, triggerGameOver]);

  // Main Render & Animation Loop
  useEffect(() => {
    let animationFrameId;

    const render = (time) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const currentTheme = THEMES[theme] || THEMES.cyberpunk;

      // 1. Clear & Background
      ctx.fillStyle = currentTheme.bg;
      ctx.fillRect(0, 0, CANVAS_DIMENSION, CANVAS_DIMENSION);

      // 2. Neon Grid lines
      ctx.strokeStyle = currentTheme.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, CANVAS_DIMENSION);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i * CELL_SIZE);
        ctx.lineTo(CANVAS_DIMENSION, i * CELL_SIZE);
        ctx.stroke();
      }

      // 3. Wall Border glow if Classic mode
      if (gameMode === 'classic') {
        ctx.strokeStyle = currentTheme.wallColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = currentTheme.wallColor;
        ctx.shadowBlur = 10;
        ctx.strokeRect(1, 1, CANVAS_DIMENSION - 2, CANVAS_DIMENSION - 2);
        ctx.shadowBlur = 0;
      }

      // 4. Render Food with pulsing glow & emoji / icon
      const food = foodRef.current;
      if (food) {
        const foodConfig = FOOD_TYPES[food.type] || FOOD_TYPES.apple;
        const fx = food.x * CELL_SIZE;
        const fy = food.y * CELL_SIZE;
        const pulse = Math.sin(time / 180) * 2.5;

        // Food Outer Aura
        ctx.shadowColor = foodConfig.color;
        ctx.shadowBlur = 14 + pulse * 2;
        ctx.fillStyle = foodConfig.color;
        drawRoundedRect(
          ctx,
          fx + 3 - pulse / 2,
          fy + 3 - pulse / 2,
          CELL_SIZE - 6 + pulse,
          CELL_SIZE - 6 + pulse,
          8
        );
        ctx.fill();
        ctx.shadowBlur = 0;

        // Icon representation inside food
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(foodConfig.icon, fx + CELL_SIZE / 2, fy + CELL_SIZE / 2 + 1);
      }

      // 5. Render Snake with Glowing Gradient Body
      const snake = snakeRef.current;
      if (snake && snake.length > 0) {
        snake.forEach((seg, idx) => {
          const sx = seg.x * CELL_SIZE;
          const sy = seg.y * CELL_SIZE;
          const isHead = idx === 0;

          if (isHead) {
            // Snake Head
            ctx.shadowColor = currentTheme.snakeHead;
            ctx.shadowBlur = 12;
            ctx.fillStyle = currentTheme.snakeHead;
            drawRoundedRect(ctx, sx + 1, sy + 1, CELL_SIZE - 2, CELL_SIZE - 2, 7);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Eyes based on direction
            const dir = directionRef.current;
            ctx.fillStyle = currentTheme.eyeColor;
            const eyeSize = 3;

            let eye1 = { x: sx + 6, y: sy + 6 };
            let eye2 = { x: sx + CELL_SIZE - 6, y: sy + 6 };

            if (dir.x === 1) {
              // Right
              eye1 = { x: sx + CELL_SIZE - 5, y: sy + 6 };
              eye2 = { x: sx + CELL_SIZE - 5, y: sy + CELL_SIZE - 6 };
            } else if (dir.x === -1) {
              // Left
              eye1 = { x: sx + 5, y: sy + 6 };
              eye2 = { x: sx + 5, y: sy + CELL_SIZE - 6 };
            } else if (dir.y === 1) {
              // Down
              eye1 = { x: sx + 6, y: sy + CELL_SIZE - 5 };
              eye2 = { x: sx + CELL_SIZE - 6, y: sy + CELL_SIZE - 5 };
            }

            ctx.beginPath();
            ctx.arc(eye1.x, eye1.y, eyeSize, 0, Math.PI * 2);
            ctx.arc(eye2.x, eye2.y, eyeSize, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Body segments with color fade
            const progress = idx / snake.length;
            ctx.fillStyle = idx % 2 === 0 ? currentTheme.snakeBodyStart : currentTheme.snakeBodyEnd;
            ctx.globalAlpha = Math.max(0.4, 1 - progress * 0.5);
            drawRoundedRect(ctx, sx + 2, sy + 2, CELL_SIZE - 4, CELL_SIZE - 4, 5);
            ctx.fill();
            ctx.globalAlpha = 1.0;
          }
        });
      }

      // 6. Update & Render Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // 7. Update & Render Floating Texts
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy;
        ft.life -= 0.025;
        if (ft.life <= 0) {
          floatingTextsRef.current.splice(i, 1);
          continue;
        }
        ctx.font = 'bold 12px "Space Grotesk", sans-serif';
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = ft.life;
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 8;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
      }

      // 8. Physics Engine Step
      if (gameState === 'PLAYING') {
        let baseSpeed = DIFFICULTIES[difficulty].baseSpeed;
        if (activePower?.type === 'speed') baseSpeed *= 0.65;
        if (activePower?.type === 'freeze') baseSpeed *= 1.45;

        if (time - lastTickRef.current >= baseSpeed) {
          gameTick();
          lastTickRef.current = time;
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, difficulty, theme, gameMode, activePower, gameTick]);

  return (
    <div style={styles.container}>
      {/* HEADER HUD */}
      <header style={styles.header}>
        <div style={styles.titleWrap}>
          <h1 style={styles.title}>
            <span style={{ color: '#00f0ff' }}>CYBER</span>
            <span style={{ color: '#ff007b' }}>SNAKE</span>
          </h1>
          <span style={styles.versionBadge}>NEON EDITION</span>
        </div>

        {/* Top Controls: Audio, Theme Selector */}
        <div style={styles.topActions}>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="neon-btn"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
            title="Toggle Sound"
          >
            {isMuted ? '🔇 Muted' : '🔊 Sound'}
          </button>

          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            style={styles.selectInput}
          >
            {Object.entries(THEMES).map(([key, t]) => (
              <option key={key} value={key}>
                🎨 {t.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* DASHBOARD SCOREBAR */}
      <div style={styles.dashboard} className="glass-panel">
        <div style={styles.statBox}>
          <span style={styles.statLabel}>SCORE</span>
          <span style={{ ...styles.statVal, color: '#00f0ff' }}>{score}</span>
        </div>

        <div style={styles.statBox}>
          <span style={styles.statLabel}>HIGH SCORE</span>
          <span style={{ ...styles.statVal, color: '#ffd600' }}>{highScore}</span>
        </div>

        <div style={styles.statBox}>
          <span style={styles.statLabel}>COMBO</span>
          <span style={{ ...styles.statVal, color: combo > 1 ? '#ff007b' : '#8e9bb0' }}>
            x{combo}
          </span>
        </div>

        {activePower && (
          <div style={{ ...styles.statBox, borderColor: '#f59e0b' }}>
            <span style={styles.statLabel}>POWERUP</span>
            <span style={{ ...styles.statVal, color: '#f59e0b', fontSize: '1rem' }}>
              {activePower.type === 'speed' ? '⚡ TURBO' : '❄️ FROST'} ({powerTimeLeft}s)
            </span>
          </div>
        )}
      </div>

      {/* MAIN GAME BOARD AREA */}
      <div style={styles.gameArea}>
        {/* GAME CANVAS */}
        <div style={styles.canvasWrapper} className="glass-panel">
          <canvas
            ref={canvasRef}
            width={CANVAS_DIMENSION}
            height={CANVAS_DIMENSION}
            style={styles.canvas}
          />

          {/* OVERLAY: START SCREEN */}
          {gameState === 'IDLE' && (
            <div style={styles.overlay}>
              <div style={styles.modalCard} className="glass-panel">
                <h2 style={{ fontSize: '1.8rem', color: '#00f0ff', marginBottom: '0.5rem' }}>
                  CYBER SNAKE ARCADE
                </h2>
                <p style={{ color: '#8e9bb0', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  Collect neon food, activate cyber power-ups & survive!
                </p>
                <button
                  onClick={startGame}
                  className="neon-btn floating"
                  style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}
                >
                  🚀 START GAME
                </button>
              </div>
            </div>
          )}

          {/* OVERLAY: PAUSED */}
          {gameState === 'PAUSED' && (
            <div style={styles.overlay}>
              <div style={styles.modalCard} className="glass-panel">
                <h2 style={{ fontSize: '1.8rem', color: '#ffd600', marginBottom: '0.5rem' }}>
                  GAME PAUSED
                </h2>
                <p style={{ color: '#8e9bb0', marginBottom: '1.5rem' }}>
                  Press <kbd style={styles.kbd}>SPACE</kbd> to resume
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={() => setGameState('PLAYING')} className="neon-btn">
                    ▶️ RESUME
                  </button>
                  <button onClick={startGame} className="neon-btn secondary">
                    🔄 RESTART
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* OVERLAY: GAME OVER */}
          {gameState === 'GAMEOVER' && (
            <div style={styles.overlay}>
              <div style={styles.modalCard} className="glass-panel">
                <h2 style={{ fontSize: '2rem', color: '#ff007b', marginBottom: '0.2rem' }}>
                  SYSTEM CRASHED
                </h2>
                <p style={{ color: '#8e9bb0', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  {score >= highScore && score > 0 ? '🏆 NEW HIGH SCORE RECORD!' : 'Better luck next run!'}
                </p>

                <div style={styles.scoreSummary}>
                  <div style={styles.summaryItem}>
                    <span>Final Score:</span>
                    <strong style={{ color: '#00f0ff' }}>{score}</strong>
                  </div>
                  <div style={styles.summaryItem}>
                    <span>Apples Eaten:</span>
                    <strong>{stats.applesEaten}</strong>
                  </div>
                  <div style={styles.summaryItem}>
                    <span>Best Combo:</span>
                    <strong style={{ color: '#ff007b' }}>x{stats.highestCombo}</strong>
                  </div>
                  <div style={styles.summaryItem}>
                    <span>Time Survived:</span>
                    <strong>{stats.timeElapsed}s</strong>
                  </div>
                </div>

                <button
                  onClick={startGame}
                  className="neon-btn floating"
                  style={{ fontSize: '1.1rem', padding: '0.8rem 2rem', marginTop: '1.2rem' }}
                >
                  🔄 PLAY AGAIN (R)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR SETTINGS & INFO */}
        <div style={styles.sidebar}>
          {/* Difficulty Selector */}
          <div style={styles.controlCard} className="glass-panel">
            <h3 style={styles.cardHeading}>DIFFICULTY</h3>
            <div style={styles.pillGroup}>
              {Object.entries(DIFFICULTIES).map(([key, item]) => (
                <button
                  key={key}
                  onClick={() => setDifficulty(key)}
                  disabled={gameState === 'PLAYING'}
                  style={{
                    ...styles.pillBtn,
                    borderColor: difficulty === key ? item.color : 'rgba(255,255,255,0.1)',
                    backgroundColor:
                      difficulty === key ? `${item.color}22` : 'rgba(255,255,255,0.03)',
                    color: difficulty === key ? item.color : '#8e9bb0',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Game Mode */}
          <div style={styles.controlCard} className="glass-panel">
            <h3 style={styles.cardHeading}>BORDER MODE</h3>
            <div style={styles.pillGroup}>
              <button
                onClick={() => setGameMode('classic')}
                disabled={gameState === 'PLAYING'}
                style={{
                  ...styles.pillBtn,
                  borderColor: gameMode === 'classic' ? '#ff007b' : 'rgba(255,255,255,0.1)',
                  backgroundColor:
                    gameMode === 'classic' ? 'rgba(255, 0, 123, 0.15)' : 'rgba(255,255,255,0.03)',
                  color: gameMode === 'classic' ? '#ff007b' : '#8e9bb0',
                }}
              >
                🧱 Classic (Walls Kill)
              </button>
              <button
                onClick={() => setGameMode('wrap')}
                disabled={gameState === 'PLAYING'}
                style={{
                  ...styles.pillBtn,
                  borderColor: gameMode === 'wrap' ? '#00f0ff' : 'rgba(255,255,255,0.1)',
                  backgroundColor:
                    gameMode === 'wrap' ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255,255,255,0.03)',
                  color: gameMode === 'wrap' ? '#00f0ff' : '#8e9bb0',
                }}
              >
                🌀 Portal (Wrap Edges)
              </button>
            </div>
          </div>

          {/* Powerups Legend */}
          <div style={styles.controlCard} className="glass-panel">
            <h3 style={styles.cardHeading}>ITEM MATRIX</h3>
            <div style={styles.legendGrid}>
              <div style={styles.legendItem}>
                <span>🍎 Apple</span>
                <span style={{ color: '#ef4444' }}>+10 pts</span>
              </div>
              <div style={styles.legendItem}>
                <span>⭐ Gold Berry</span>
                <span style={{ color: '#ffd600' }}>+35 pts</span>
              </div>
              <div style={styles.legendItem}>
                <span>⚡ Turbo Boost</span>
                <span style={{ color: '#f59e0b' }}>Speed x2</span>
              </div>
              <div style={styles.legendItem}>
                <span>❄️ Frost Slow</span>
                <span style={{ color: '#38bdf8' }}>Slow Mo</span>
              </div>
              <div style={styles.legendItem}>
                <span>✂️ Quantum Shrink</span>
                <span style={{ color: '#a855f7' }}>Cut Body</span>
              </div>
            </div>
          </div>

          {/* On-screen D-Pad for Mobile / Touch / Click */}
          <div style={styles.dpadCard} className="glass-panel">
            <div style={styles.dpadRow}>
              <button
                onClick={() => handleDirectionChange({ x: 0, y: -1 })}
                style={styles.dpadBtn}
                title="Up"
              >
                ▲
              </button>
            </div>
            <div style={styles.dpadRow}>
              <button
                onClick={() => handleDirectionChange({ x: -1, y: 0 })}
                style={styles.dpadBtn}
                title="Left"
              >
                ◀
              </button>
              <button
                onClick={() => {
                  if (gameState === 'PLAYING') setGameState('PAUSED');
                  else if (gameState === 'PAUSED') setGameState('PLAYING');
                  else if (gameState === 'IDLE' || gameState === 'GAMEOVER') startGame();
                }}
                style={{ ...styles.dpadBtn, background: 'rgba(0,240,255,0.15)', color: '#00f0ff' }}
                title="Action"
              >
                {gameState === 'PLAYING' ? '⏸' : '▶'}
              </button>
              <button
                onClick={() => handleDirectionChange({ x: 1, y: 0 })}
                style={styles.dpadBtn}
                title="Right"
              >
                ▶
              </button>
            </div>
            <div style={styles.dpadRow}>
              <button
                onClick={() => handleDirectionChange({ x: 0, y: 1 })}
                style={styles.dpadBtn}
                title="Down"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER HELPER */}
      <footer style={styles.footer}>
        <span>
          Controls: <kbd style={styles.kbd}>W A S D</kbd> or <kbd style={styles.kbd}>Arrows</kbd> to
          Move | <kbd style={styles.kbd}>SPACE</kbd> Pause | <kbd style={styles.kbd}>R</kbd> Restart
        </span>
      </footer>
    </div>
  );
}

// ==========================================
// INLINE STYLES (Modular & Self-contained)
// ==========================================
const styles = {
  container: {
    width: '100%',
    maxWidth: '1000px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    margin: '0 auto',
  },
  header: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
    padding: '0.5rem 0',
  },
  titleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  title: {
    fontFamily: '"Space Grotesk", sans-serif',
    fontWeight: 800,
    fontSize: '2rem',
    letterSpacing: '1px',
    margin: 0,
  },
  versionBadge: {
    fontSize: '0.7rem',
    fontFamily: '"Space Grotesk", sans-serif',
    fontWeight: 700,
    padding: '0.2rem 0.6rem',
    borderRadius: '8px',
    background: 'rgba(255, 0, 123, 0.15)',
    border: '1px solid rgba(255, 0, 123, 0.4)',
    color: '#ff007b',
    letterSpacing: '1px',
  },
  topActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  selectInput: {
    background: 'rgba(18, 22, 36, 0.85)',
    color: '#f0f4f8',
    border: '1px solid rgba(0, 240, 255, 0.25)',
    borderRadius: '10px',
    padding: '0.5rem 0.8rem',
    fontFamily: 'inherit',
    fontSize: '0.85rem',
    cursor: 'pointer',
    outline: 'none',
  },
  dashboard: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: '0.85rem 1.5rem',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '80px',
  },
  statLabel: {
    fontSize: '0.7rem',
    letterSpacing: '1px',
    color: '#8e9bb0',
    fontFamily: '"Space Grotesk", sans-serif',
    fontWeight: 700,
    marginBottom: '0.2rem',
  },
  statVal: {
    fontSize: '1.4rem',
    fontWeight: 800,
    fontFamily: '"Space Grotesk", sans-serif',
  },
  gameArea: {
    width: '100%',
    display: 'flex',
    gap: '1.5rem',
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  canvasWrapper: {
    position: 'relative',
    padding: '10px',
    borderRadius: '24px',
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvas: {
    borderRadius: '16px',
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    backgroundColor: '#0a0d18',
    boxShadow: '0 0 30px rgba(0, 0, 0, 0.8)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(5, 7, 15, 0.82)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    zIndex: 10,
  },
  modalCard: {
    width: '100%',
    maxWidth: '360px',
    padding: '2rem 1.5rem',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  scoreSummary: {
    width: '100%',
    background: 'rgba(0, 0, 0, 0.4)',
    borderRadius: '12px',
    padding: '0.85rem 1.2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '0.5rem',
    fontSize: '0.9rem',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#cbd5e1',
  },
  sidebar: {
    flex: '1 1 280px',
    maxWidth: '340px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  controlCard: {
    padding: '1rem',
    borderRadius: '16px',
  },
  cardHeading: {
    fontSize: '0.75rem',
    fontFamily: '"Space Grotesk", sans-serif',
    letterSpacing: '1px',
    color: '#8e9bb0',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
  },
  pillGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  pillBtn: {
    flex: '1 1 calc(50% - 0.5rem)',
    padding: '0.5rem 0.75rem',
    fontSize: '0.8rem',
    fontFamily: '"Space Grotesk", sans-serif',
    fontWeight: 600,
    borderRadius: '10px',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  legendGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    fontSize: '0.85rem',
  },
  legendItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.25rem 0.5rem',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  dpadCard: {
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.4rem',
  },
  dpadRow: {
    display: 'flex',
    gap: '0.4rem',
  },
  dpadBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '12px',
    background: 'rgba(18, 24, 40, 0.9)',
    border: '1px solid rgba(0, 240, 255, 0.25)',
    color: '#f0f4f8',
    fontSize: '1.1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  footer: {
    marginTop: '0.5rem',
    fontSize: '0.8rem',
    color: '#64748b',
    textAlign: 'center',
  },
  kbd: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '4px',
    padding: '0.15rem 0.4rem',
    color: '#cbd5e1',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
  },
};
