// server.ts
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

interface Point {
  x: number;
  y: number;
}

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface Player {
  id: string;
  snake: Point[];
  direction: Direction;
  score: number;
  color: string;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// --- Game Configuration ---
const GRID_WIDTH = 96;
const GRID_HEIGHT = 54;
const INITIAL_SNAKE_LENGTH = 3;
const TICK_RATE = 150; // in ms
const INITIAL_FRUIT_COUNT = 10;

// --- Game State ---
const players: Record<string, Player> = {};
const fruits: Point[] = [];

// --- Utility Functions ---
const getRandomInt = (max: number) => Math.floor(Math.random() * max);
const getRandomPosition = (): Point => ({
  x: getRandomInt(GRID_WIDTH),
  y: getRandomInt(GRID_HEIGHT)
});

// Checks if a given point is occupied by any snake.
const isPositionOccupied = (pos: Point): boolean => {
  for (const id in players) {
    const player = players[id];
    if (player.snake.some(segment => segment.x === pos.x && segment.y === pos.y)) {
      return true;
    }
  }
  return false;
};

// Returns a "safe" spawn position (tries a few times).
const getSafeSpawnPosition = (): Point => {
  let pos = getRandomPosition();
  let attempts = 0;
  while (isPositionOccupied(pos) && attempts < 100) {
    pos = getRandomPosition();
    attempts++;
  }
  return pos;
};

// Creates a snake of length INITIAL_SNAKE_LENGTH starting at a position
// and extending in the opposite direction to the given one.
const createSnake = (start: Point, direction: Direction): Point[] => {
  const snake: Point[] = [];
  snake.push(start);
  for (let i = 1; i < INITIAL_SNAKE_LENGTH; i++) {
    let newSegment: Point;
    switch (direction) {
      case 'RIGHT':
        newSegment = { x: start.x - i, y: start.y };
        break;
      case 'LEFT':
        newSegment = { x: start.x + i, y: start.y };
        break;
      case 'DOWN':
        newSegment = { x: start.x, y: start.y - i };
        break;
      case 'UP':
      default:
        newSegment = { x: start.x, y: start.y + i };
        break;
    }
    snake.push(newSegment);
  }
  return snake;
};

// Spawn a new fruit at a random location.
const spawnFruit = () => {
  const pos = getRandomPosition();
  fruits.push(pos);
};

// Initially spawn several fruits.
for (let i = 0; i < INITIAL_FRUIT_COUNT; i++) {
  spawnFruit();
}

// Helper: compare two points.
const pointsEqual = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

// Prevent reversing direction.
const isOpposite = (d1: Direction, d2: Direction): boolean =>
  (d1 === 'UP' && d2 === 'DOWN') ||
  (d1 === 'DOWN' && d2 === 'UP') ||
  (d1 === 'LEFT' && d2 === 'RIGHT') ||
  (d1 === 'RIGHT' && d2 === 'LEFT');

// --- Game Loop ---
// Runs every TICK_RATE ms.
setInterval(() => {
  // Save the current snake positions for collision detection.
  const currentSnakes: Record<string, Point[]> = {};
  for (const id in players) {
    currentSnakes[id] = players[id].snake;
  }

  // Process each player.
  for (const id in players) {
    const player = players[id];
    const head = player.snake[0];
    let newHead: Point;
    switch (player.direction) {
      case 'UP':
        newHead = { x: head.x, y: head.y - 1 };
        break;
      case 'DOWN':
        newHead = { x: head.x, y: head.y + 1 };
        break;
      case 'LEFT':
        newHead = { x: head.x - 1, y: head.y };
        break;
      case 'RIGHT':
      default:
        newHead = { x: head.x + 1, y: head.y };
        break;
    }

    // Check for collisions: with the walls or any snake segment.
    let collision = false;
    if (
      newHead.x < 0 ||
      newHead.x >= GRID_WIDTH ||
      newHead.y < 0 ||
      newHead.y >= GRID_HEIGHT
    ) {
      collision = true;
    } else {
      for (const otherId in currentSnakes) {
        const segments = currentSnakes[otherId];
        if (segments.some(segment => pointsEqual(segment, newHead))) {
          collision = true;
          break;
        }
      }
    }

    if (collision) {
      // Before respawning, turn ~25% of the snake’s body segments into fruits.
      for (const segment of player.snake) {
        if (Math.random() < 0.25) {
          if (!fruits.some(fruit => pointsEqual(fruit, segment))) {
            fruits.push({ ...segment });
          }
        }
      }
      // Respawn the player at a safe position with a small snake.
      const spawnPos = getSafeSpawnPosition();
      player.direction = 'RIGHT';
      player.snake = createSnake(spawnPos, player.direction);
      // (Score is maintained across respawns.)
      continue;
    }

    // Check if the snake has eaten a fruit.
    const fruitIndex = fruits.findIndex(fruit => pointsEqual(fruit, newHead));
    let grow = false;
    if (fruitIndex !== -1) {
      fruits.splice(fruitIndex, 1);
      player.score += 1;
      grow = true;
      // Spawn a new fruit to keep the board populated.
      spawnFruit();
    }

    // Move the snake: add the new head.
    const newSnake = [newHead, ...player.snake];
    if (!grow) {
      newSnake.pop();
    }
    player.snake = newSnake;
  }

  // Broadcast the updated game state.
  io.emit('gameState', { players, fruits, gridWidth: GRID_WIDTH, gridHeight: GRID_HEIGHT });
}, TICK_RATE);

// --- Socket.IO Handling ---
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  const spawnPos = getSafeSpawnPosition();
  const newPlayer: Player = {
    id: socket.id,
    snake: createSnake(spawnPos, 'RIGHT'),
    direction: 'RIGHT',
    score: 0,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16)
  };
  players[socket.id] = newPlayer;

  // Listen for direction changes from the client.
  socket.on('changeDirection', (newDirection: Direction) => {
    if (!isOpposite(players[socket.id].direction, newDirection)) {
      players[socket.id].direction = newDirection;
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnect:', socket.id);
    delete players[socket.id];
  });
});

// Optionally serve static files.
app.use(express.static('public'));

// server client built files
app.use(express.static("dist"));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
